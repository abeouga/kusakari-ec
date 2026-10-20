output "user_pool_id" { value = module.ec.user_pool_id }
output "ec_environment" {
  value = {
    SPRING_PROFILES_ACTIVE     = "cognito"
    KUSAKARI_COGNITO_ISSUER    = module.ec.issuer
    KUSAKARI_COGNITO_CLIENT_ID = module.ec.client_id
    KUSAKARI_COGNITO_DOMAIN    = module.ec.domain
  }
}
output "canvas_environment" { value = module.canvas.environment }
