"""
services/payment_service.py
AHCT Student Hub — Optional live payment gateway (Monnify)
==============================================================================
The supplied Code.gs already had a getTemporaryAccountDetails() that
returned a STATIC settlement account (Section 5, Stage 3) with a comment
noting Monnify as the intended real integration. This module implements
that integration for real, but keeps it OFF by default (MONNIFY_ENABLED=false)
so the project runs immediately with the same static-account behaviour the
original had, and can be switched to live reserved accounts later by
setting three environment variables — see docs/SETUP_GUIDE.md, "Optional:
live payments with Monnify".
==============================================================================
"""

import base64
import requests


def _get_access_token(config):
    credentials = base64.b64encode(f"{config.MONNIFY_API_KEY}:{config.MONNIFY_SECRET_KEY}".encode()).decode()
    resp = requests.post(
        f"{config.MONNIFY_BASE_URL}/api/v1/auth/login",
        headers={"Authorization": f"Basic {credentials}"},
        timeout=15,
    )
    resp.raise_for_status()
    return resp.json()["responseBody"]["accessToken"]


def create_monnify_reserved_account(config, reference, customer_email, customer_name):
    token = _get_access_token(config)
    resp = requests.post(
        f"{config.MONNIFY_BASE_URL}/api/v2/bank-transfer/reserved-accounts",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        json={
            "accountReference": reference,
            "accountName": customer_name or "AH Student Hub Applicant",
            "currencyCode": "NGN",
            "contractCode": config.MONNIFY_CONTRACT_CODE,
            "customerEmail": customer_email or config.ADMIN_EMAIL,
            "customerName": customer_name or "AH Student Hub Applicant",
        },
        timeout=20,
    )
    resp.raise_for_status()
    body = resp.json()["responseBody"]
    account = body["accountNumber" in body and body or body]
    accounts = body.get("accounts", [body])
    primary = accounts[0] if accounts else body
    return {
        "bankName": primary.get("bankName", ""),
        "accountNumber": primary.get("accountNumber", ""),
        "accountName": body.get("accountName", ""),
        "reference": reference,
    }


def verify_monnify_transaction(config, transaction_reference):
    token = _get_access_token(config)
    resp = requests.get(
        f"{config.MONNIFY_BASE_URL}/api/v2/transactions/{transaction_reference}",
        headers={"Authorization": f"Bearer {token}"},
        timeout=15,
    )
    resp.raise_for_status()
    body = resp.json()["responseBody"]
    return body.get("paymentStatus") == "PAID"
