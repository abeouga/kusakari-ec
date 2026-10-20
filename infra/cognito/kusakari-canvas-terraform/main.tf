# Canvas consumes the EC server session. A second pool/client would split the login.
variable "cognito_issuer" { type = string }
variable "ec_internal_url" { type = string }
output "environment" {
  value = {
    KUSAKARI_AUTH_MODE          = "cognito"
    KUSAKARI_CANVAS_AUTH_EC_URL = var.ec_internal_url
  }
}
output "shared_issuer" { value = var.cognito_issuer }
