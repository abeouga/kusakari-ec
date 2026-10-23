terraform {
  required_providers {
    aws = { source = "hashicorp/aws" }
  }
}

variable "domain_prefix" { type = string }
variable "callback_urls" { type = list(string) }
variable "logout_urls" { type = list(string) }

resource "aws_cognito_user_pool" "kusakari" {
  name                     = "kusakari-development"
  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]
  deletion_protection      = "ACTIVE"
  user_pool_tier           = "ESSENTIALS"
  username_configuration { case_sensitive = false }
  # Development-only policy supports the user's explicitly specified test password.
  password_policy {
    minimum_length                   = 8
    require_lowercase                = false
    require_uppercase                = false
    require_numbers                  = false
    require_symbols                  = false
    temporary_password_validity_days = 7
  }
  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }
  email_configuration { email_sending_account = "COGNITO_DEFAULT" }
  lifecycle { prevent_destroy = true }
}

resource "aws_cognito_user_pool_client" "ec" {
  name                                 = "kusakari-ec"
  user_pool_id                         = aws_cognito_user_pool.kusakari.id
  generate_secret                      = false
  explicit_auth_flows                  = ["ALLOW_USER_PASSWORD_AUTH", "ALLOW_USER_SRP_AUTH", "ALLOW_CUSTOM_AUTH", "ALLOW_REFRESH_TOKEN_AUTH"]
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_flows                  = ["code"]
  allowed_oauth_scopes                 = ["openid", "email", "profile"]
  supported_identity_providers         = ["COGNITO"]
  callback_urls                        = var.callback_urls
  logout_urls                          = var.logout_urls
  prevent_user_existence_errors        = "ENABLED"
  enable_token_revocation              = true
  access_token_validity                = 60
  id_token_validity                    = 60
  refresh_token_validity               = 30
  token_validity_units {
    access_token  = "minutes"
    id_token      = "minutes"
    refresh_token = "days"
  }
}

resource "aws_cognito_user_pool_domain" "login" {
  domain                = var.domain_prefix
  user_pool_id          = aws_cognito_user_pool.kusakari.id
  managed_login_version = 2
}

resource "aws_cognito_managed_login_branding" "ec" {
  user_pool_id                = aws_cognito_user_pool.kusakari.id
  client_id                   = aws_cognito_user_pool_client.ec.id
  use_cognito_provided_values = true
  depends_on                  = [aws_cognito_user_pool_domain.login]
}

output "user_pool_id" { value = aws_cognito_user_pool.kusakari.id }
output "client_id" { value = aws_cognito_user_pool_client.ec.id }
output "issuer" { value = "https://${aws_cognito_user_pool.kusakari.endpoint}" }
output "domain" {
  value = "https://${aws_cognito_user_pool_domain.login.domain}.auth.${split("_", aws_cognito_user_pool.kusakari.id)[0]}.amazoncognito.com"
}
