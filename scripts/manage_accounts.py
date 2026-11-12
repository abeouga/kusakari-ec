"""Explicit, repeatable operator-account setup. Run with the Canvas Python environment."""
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
    parser.add_argument("--admin", required=True)
    parser.add_argument("--password-file")
    args = parser.parse_args()
    env = environment(args.env_file)
    url_key = "KUSAKARI_EC_E2E_DB_URL" if args.database.endswith("_e2e") else "KUSAKARI_EC_DB_URL"
    url = urlparse(env[url_key].removeprefix("jdbc:"))
    if url.path.lstrip("/") != args.database:
        raise RuntimeError("Explicit target database does not match configuration.")
    issuer = env["KUSAKARI_COGNITO_ISSUER"]
    region = urlparse(issuer).hostname.split(".")[1]
    payload = {"UserPoolId": issuer.rsplit("/", 1)[1], "Username": args.admin}
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
    connection = pymysql.connect(
        host=url.hostname, port=url.port or 3306, database=args.database,
        user=env["KUSAKARI_EC_DB_USER"], password=env["KUSAKARI_EC_DB_PASSWORD"],
        charset="utf8mb4", cursorclass=pymysql.cursors.DictCursor,
    )
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT id, account_type FROM members WHERE issuer=%s AND subject=%s FOR UPDATE",
                           (issuer, subject))
            member = cursor.fetchone()
            if member is None:
                cursor.execute("""INSERT INTO members(id,issuer,subject,email,display_name,account_type,enabled,
                    email_verified_at) VALUES(%s,%s,%s,%s,%s,'ADMIN',TRUE,CURRENT_TIMESTAMP(6))""",
                               (str(uuid4()), issuer, subject, args.admin, args.admin))
            elif member["account_type"] == "USER":
                cursor.execute("UPDATE members SET account_type='ADMIN' WHERE id=%s", (member["id"],))
            elif member["account_type"] != "ADMIN":
                # An owner or a staff account is tied to an organization; it never becomes the operator.
                raise RuntimeError("The account belongs to a shop and is not changed to ADMIN.")
        connection.commit()
        print(json.dumps({"applied": True, "administrator": True}))
    finally:
        connection.rollback()
        connection.close()


if __name__ == "__main__":
    main()
