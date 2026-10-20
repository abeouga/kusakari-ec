"""Explicit, repeatable account/catalog setup. Run with the Canvas Python environment."""
import argparse
import json
from pathlib import Path
import subprocess
import tempfile
from urllib.parse import urlparse
from uuid import uuid4

import pymysql


def environment(path):
    result = {}
    for line in Path(path).read_text(encoding="utf-8-sig").splitlines():
        if "=" in line and not line.lstrip().startswith("#"):
            key, value = line.split("=", 1)
            result[key.strip()] = value.strip().strip("\"'")
    return result


def aws(action, payload, region):
    # Keep passwords out of command arguments, output and tracked files.
    with tempfile.TemporaryDirectory(prefix="kusakari-account-") as directory:
        file = Path(directory) / "request.json"
        file.write_text(json.dumps(payload), encoding="utf-8")
        result = subprocess.run(
            ["aws", "cognito-idp", action, "--region", region,
             "--cli-input-json", "file://" + file.as_posix(), "--output", "json"],
            capture_output=True, text=True,
        )
        if result.returncode:
            if "UserNotFoundException" in result.stderr:
                return None
            raise RuntimeError("Cognito account operation failed: " + action)
        return json.loads(result.stdout or "{}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--env-file", required=True)
    parser.add_argument("--database", required=True, choices=["kusakari", "kusakari_e2e"])
    parser.add_argument("--seller", required=True)
    parser.add_argument("--store", required=True, type=int)
    parser.add_argument("--admin")
    parser.add_argument("--password-file")
    parser.add_argument("--expected-count", type=int, required=True)
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    env = environment(args.env_file)
    url_key = "KUSAKARI_EC_E2E_DB_URL" if args.database.endswith("_e2e") else "KUSAKARI_EC_DB_URL"
    url = urlparse(env[url_key].removeprefix("jdbc:"))
    if url.path.lstrip("/") != args.database:
        raise RuntimeError("Explicit target database does not match configuration.")
    issuer = env["KUSAKARI_COGNITO_ISSUER"]
    connection = pymysql.connect(
        host=url.hostname, port=url.port or 3306, database=args.database,
        user=env["KUSAKARI_EC_DB_USER"], password=env["KUSAKARI_EC_DB_PASSWORD"],
        charset="utf8mb4", cursorclass=pymysql.cursors.DictCursor,
    )
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT * FROM auth_members WHERE email=%s AND issuer=%s FOR UPDATE", (args.seller, issuer))
            members = cursor.fetchall()
            if len(members) != 1 or members[0]["role"] != "SELLER" or members[0]["store_id"] != args.store:
                raise RuntimeError("An existing seller and matching store membership are required.")
            seller = members[0]
            cursor.execute(
                """SELECT p.id,p.sku,p.name,p.owner_member_id,i.quantity,i.publication_status,
                   SHA2(CAST(p.model_composition AS CHAR),256) model_hash,p.image_url,p.price_yen
                   FROM products p JOIN inventory i ON i.product_id=p.id AND i.store_id=%s
                   WHERE p.active=TRUE AND (p.owner_member_id IS NULL OR p.owner_member_id=%s)
                   FOR UPDATE""", (args.store, seller["id"]),
            )
            products = sorted(cursor.fetchall(), key=lambda product: product["id"])
            if len(products) != args.expected_count:
                raise RuntimeError(f"Expected {args.expected_count} products; found {len(products)}.")
            manifest = Path(args.manifest)
            manifest.parent.mkdir(parents=True, exist_ok=True)
            manifest.write_text(json.dumps({"database": args.database, "store": args.store, "products": products},
                                           ensure_ascii=False, indent=2), encoding="utf-8")
            if not args.apply:
                print(json.dumps({"dryRun": True, "products": len(products)}))
                return
            for product in products:
                if product["owner_member_id"] is None:
                    cursor.execute("UPDATE products SET owner_member_id=%s WHERE id=%s", (seller["id"], product["id"]))
                    cursor.execute("UPDATE inventory SET publication_status='PUBLISHED' WHERE product_id=%s AND store_id=%s",
                                   (product["id"], args.store))
            connection.commit()
        if args.admin:
            region = urlparse(issuer).hostname.split(".")[1]
            pool = issuer.rsplit("/", 1)[1]
            payload = {"UserPoolId": pool, "Username": args.admin}
            account = aws("admin-get-user", payload, region)
            if account is None:
                if not args.password_file:
                    raise RuntimeError("--password-file is required for a new Cognito account.")
                password = environment(args.password_file)["KUSAKARI_TEST_PASSWORD"]
                aws("admin-create-user", {
                    **payload, "MessageAction": "SUPPRESS",
                    "UserAttributes": [{"Name": "email", "Value": args.admin},
                                       {"Name": "email_verified", "Value": "true"}],
                }, region)
                aws("admin-set-user-password", {**payload, "Password": password, "Permanent": True}, region)
                account = aws("admin-get-user", payload, region)
            subject = next(a["Value"] for a in account["UserAttributes"] if a["Name"] == "sub")
            with connection.cursor() as cursor:
                cursor.execute("""INSERT INTO auth_members(id,issuer,subject,email,display_name,role,enabled)
                    VALUES(%s,%s,%s,%s,%s,'ADMIN',TRUE)
                    ON DUPLICATE KEY UPDATE role='ADMIN'""",
                    (str(uuid4()), issuer, subject, args.admin, args.admin))
            connection.commit()
        print(json.dumps({"applied": True, "products": len(products), "administrator": bool(args.admin)}))
    finally:
        connection.rollback()
        connection.close()


if __name__ == "__main__":
    main()
