variable "region" {
  type    = string
  default = "ap-northeast-1"
}
variable "account_id" {
  type    = string
  default = "497746198728"
  validation {
    condition     = can(regex("^[0-9]{12}$", var.account_id))
    error_message = "account_id must be a 12-digit AWS account ID."
  }
}
variable "domain_prefix" {
  type    = string
  default = "kusakari-497746198728-dev"
  validation {
    condition     = can(regex("^[a-z0-9][a-z0-9-]{0,61}[a-z0-9]$", var.domain_prefix))
    error_message = "Use a lowercase alphanumeric Cognito domain prefix, with internal hyphens only."
  }
}
variable "callback_urls" {
  type    = list(string)
  default = ["http://127.0.0.1:5186/api/auth/callback/cognito"]
  validation {
    condition = length(var.callback_urls) > 0 && alltrue([
      for url in var.callback_urls : can(regex("^https://[^/]+/|^http://(127\\.0\\.0\\.1|localhost):[0-9]+/", url)) && !strcontains(url, "#")
    ])
    error_message = "Callbacks must use HTTPS or loopback HTTP, with no fragment."
  }
}
variable "logout_urls" {
  type    = list(string)
  default = ["http://127.0.0.1:5186/"]
}
variable "ec_internal_url" {
  type    = string
  default = "http://127.0.0.1:8086"
}
