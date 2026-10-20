terraform {
  required_version = ">= 1.5, < 2.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
}

provider "aws" {
  region              = var.region
  allowed_account_ids = [var.account_id]
  default_tags {
    tags = { Project = "kusakari", Environment = "development", ManagedBy = "terraform" }
  }
}

module "ec" {
  source        = "./kusakari-ec-terraform"
  domain_prefix = var.domain_prefix
  callback_urls = var.callback_urls
  logout_urls   = var.logout_urls
}

module "canvas" {
  source          = "./kusakari-canvas-terraform"
  cognito_issuer  = module.ec.issuer
  ec_internal_url = var.ec_internal_url
}
