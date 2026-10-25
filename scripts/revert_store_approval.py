"""Revert one approved store application: SELLER -> USER and remove what the approval created.

Run with the Canvas Python environment. The default is a dry run; --apply requires --backup.
Anything another member, an order, a cart or a Canvas garden still uses blocks the whole revert.
"""
import argparse
import base64
import datetime
import decimal
import json
from pathlib import Path
from urllib.parse import urlparse

import pymysql

from manage_accounts import environment

APPROVAL_NOTICES = ("出店申請を受け付けました", "出店申請が承認されました")
PRODUCT_NOTICES = ("商品の公開を停止しました", "商品の公開停止を解除しました")
MEDIA_PREFIX = "/api/product-images/"
# StoreApplicationService sends each notice in the same transaction as the change it reports.
NOTICE_WINDOW_SECONDS = 60


def connect(url, user, password, database):
    parsed = urlparse(url.removeprefix("jdbc:"))
    if parsed.path.lstrip("/") != database:
        raise RuntimeError("Explicit target database does not match configuration.")
    return pymysql.connect(host=parsed.hostname, port=parsed.port or 3306, database=database,
                           user=user, password=password, charset="utf8mb4",
                           cursorclass=pymysql.cursors.DictCursor)


def ec_connection(args):
    env = environment(args.env_file)
    key = "KUSAKARI_EC_E2E_DB_URL" if args.database.endswith("_e2e") else "KUSAKARI_EC_DB_URL"
    return env, connect(env[key], env["KUSAKARI_EC_DB_USER"], env["KUSAKARI_EC_DB_PASSWORD"], args.database)


def canvas_connection(args):
    e2e = args.database.endswith("_e2e")
    if e2e != args.canvas_database.startswith("kusakari_canvas_e2e") or \
            (not e2e and args.canvas_database != "kusakari_canvas"):
        raise RuntimeError("EC and Canvas databases must both be development or both be E2E.")
    env = environment(args.canvas_env_file)
    prefix = "KUSAKARI_CANVAS_E2E_DB_" if e2e else "KUSAKARI_CANVAS_DB_"
    return connect(env[prefix + "URL"], env[prefix + "USER"], env[prefix + "PASSWORD"], args.canvas_database)


def placeholders(values):
    return ",".join(["%s"] * len(values))


def rows(cursor, sql, params=()):
    cursor.execute(sql, params)
    return cursor.fetchall()


def count(cursor, sql, params=()):
    cursor.execute(sql, params)
    return next(iter(cursor.fetchone().values()))


def media_id(url):
    return url[len(MEDIA_PREFIX):] if url and url.startswith(MEDIA_PREFIX) else None


def nearest_notice(cursor, member_id, title, body_sql, body, moment):
    if moment is None:
        return []
    found = rows(cursor, f"""SELECT * FROM notifications WHERE member_id=%s AND title=%s AND body {body_sql}
        AND ABS(TIMESTAMPDIFF(SECOND, created_at, %s)) <= %s
        ORDER BY ABS(TIMESTAMPDIFF(SECOND, created_at, %s)) LIMIT 1 FOR UPDATE""",
                 (member_id, title, body, moment, NOTICE_WINDOW_SECONDS, moment))
    return found


def collect(cursor, issuer, email):
    """Lock and gather every row the revert touches, plus the reasons it must not run."""
    blockers = []
    members = rows(cursor, "SELECT * FROM auth_members WHERE email=%s AND issuer=%s FOR UPDATE", (email, issuer))
    if len(members) != 1:
        raise RuntimeError("Exactly one member with this email is required.")
    member = members[0]
    if member["role"] != "SELLER" or member["store_id"] is None:
        raise RuntimeError(f"The member is {member['role']}, not an approved SELLER; nothing to revert.")
    store_id = member["store_id"]
    store = rows(cursor, "SELECT * FROM stores WHERE id=%s FOR UPDATE", (store_id,))[0]

    applications = rows(cursor, """SELECT * FROM store_applications WHERE member_id=%s AND status='APPROVED'
        FOR UPDATE""", (member["id"],))
    if len(applications) != 1:
        blockers.append(f"approved applications for this member: {len(applications)} (expected 1)")

    others = count(cursor, "SELECT COUNT(*) FROM auth_members WHERE store_id=%s AND id<>%s", (store_id, member["id"]))
    if others:
        blockers.append(f"other members belong to the store: {others}")

    products = rows(cursor, "SELECT * FROM products WHERE owner_member_id=%s FOR UPDATE", (member["id"],))
    product_ids = [p["id"] for p in products]
    inventory = rows(cursor, "SELECT * FROM inventory WHERE store_id=%s FOR UPDATE", (store_id,))
    foreign_stock = [r["product_id"] for r in inventory if r["product_id"] not in product_ids]
    if foreign_stock:
        blockers.append(f"store stocks products the member does not own: {foreign_stock}")
    images, materials = [], []
    if product_ids:
        marks = placeholders(product_ids)
        elsewhere = count(cursor, f"SELECT COUNT(*) FROM inventory WHERE product_id IN ({marks}) AND store_id<>%s",
                          (*product_ids, store_id))
        if elsewhere:
            blockers.append(f"member's products are stocked at other stores: {elsewhere} rows")
        for label, sql in (
            ("order items", f"SELECT COUNT(*) FROM order_items WHERE product_id IN ({marks})"),
            ("cart items", f"SELECT COUNT(*) FROM cart_items WHERE product_id IN ({marks})"),
            ("garden shopping items", f"SELECT COUNT(*) FROM garden_shopping_items WHERE product_id IN ({marks})"),
        ):
            used = count(cursor, sql, product_ids)
            if used:
                blockers.append(f"{label} reference the member's products: {used}")
        images = rows(cursor, f"SELECT * FROM product_images WHERE product_id IN ({marks}) FOR UPDATE", product_ids)
        materials = rows(cursor, f"SELECT * FROM material_products WHERE product_id IN ({marks}) FOR UPDATE",
                         product_ids)

    for label, sql in (("orders", "SELECT COUNT(*) FROM orders WHERE store_id=%s"),
                       ("carts", "SELECT COUNT(*) FROM carts WHERE store_id=%s")):
        used = count(cursor, sql, (store_id,))
        if used:
            blockers.append(f"{label} use the store: {used}")

    # Uploaded images carry no owner, so only those reachable solely from the member's products are removed.
    candidates = {media_id(p["image_url"]) for p in products} | {media_id(i["image_url"]) for i in images}
    candidates.discard(None)
    media = []
    for candidate in sorted(candidates):
        url = MEDIA_PREFIX + candidate
        shared = count(cursor, "SELECT COUNT(*) FROM products WHERE image_url=%s AND (owner_member_id IS NULL "
                       "OR owner_member_id<>%s)", (url, member["id"])) + \
            count(cursor, "SELECT COUNT(*) FROM product_images i JOIN products p ON p.id=i.product_id "
                  "WHERE i.image_url=%s AND (p.owner_member_id IS NULL OR p.owner_member_id<>%s)",
                  (url, member["id"]))
        if not shared:
            media += rows(cursor, "SELECT * FROM product_media WHERE id=%s FOR UPDATE", (candidate,))

    notices = []
    if len(applications) == 1:
        application = applications[0]
        notices += nearest_notice(cursor, member["id"], APPROVAL_NOTICES[0], "=%s", application["company"],
                                  application["created_at"])
        notices += nearest_notice(cursor, member["id"], APPROVAL_NOTICES[1], "LIKE %s",
                                  application["company"].replace("%", r"\%").replace("_", r"\_") + " / %",
                                  application["reviewed_at"])
        for product in products:
            for title in PRODUCT_NOTICES:
                notices += rows(cursor, """SELECT * FROM notifications WHERE member_id=%s AND title=%s
                    AND body LIKE %s AND created_at >= %s FOR UPDATE""",
                                (member["id"], title,
                                 product["name"].replace("%", r"\%").replace("_", r"\_") + " / %",
                                 application["reviewed_at"]))
    notices = list({n["id"]: n for n in notices}.values())

    return {"member": member, "store": store, "applications": applications, "notifications": notices,
            "products": products, "inventory": inventory, "productImages": images,
            "materialProducts": materials, "productMedia": media}, blockers


def canvas_blockers(connection, product_ids):
    if not product_ids:
        return []
    found = []
    with connection.cursor() as cursor:
        marks = placeholders(product_ids)
        placed = count(cursor, f"SELECT COUNT(*) FROM placed_objects WHERE product_id IN ({marks})", product_ids)
        if placed:
            found.append(f"Canvas gardens place the member's products: {placed}")
        for product_id in product_ids:
            history = count(cursor, """SELECT COUNT(*) FROM garden_image_history
                WHERE snapshot_json LIKE %s OR reference_summary_json LIKE %s""",
                            (f"%{product_id}%", f"%{product_id}%"))
            if history:
                found.append(f"Canvas image history references product {product_id}: {history}")
    return found


def apply(cursor, plan):
    member, store = plan["member"], plan["store"]
    product_ids = [p["id"] for p in plan["products"]]

    def delete(table, column, values):
        if values:
            cursor.execute(f"DELETE FROM {table} WHERE {column} IN ({placeholders(values)})", values)

    delete("notifications", "id", [n["id"] for n in plan["notifications"]])
    delete("store_applications", "id", [a["id"] for a in plan["applications"]])
    delete("material_products", "product_id", product_ids)
    delete("product_images", "product_id", product_ids)
    cursor.execute("DELETE FROM inventory WHERE store_id=%s", (store["id"],))
    delete("products", "id", product_ids)
    delete("product_media", "id", [m["id"] for m in plan["productMedia"]])
    cursor.execute("UPDATE auth_members SET role='USER', store_id=NULL WHERE id=%s AND role='SELLER' AND store_id=%s",
                   (member["id"], store["id"]))
    if cursor.rowcount != 1:
        raise RuntimeError("The member changed during the revert.")
    cursor.execute("DELETE FROM stores WHERE id=%s", (store["id"],))


def serializable(value):
    if isinstance(value, (bytes, bytearray)):
        return {"base64": base64.b64encode(value).decode("ascii")}
    if isinstance(value, (datetime.datetime, datetime.date)):
        return value.isoformat()
    if isinstance(value, decimal.Decimal):
        return str(value)
    raise TypeError(type(value).__name__)


def summary(plan):
    return {
        "member": plan["member"]["email"], "storeId": plan["store"]["id"], "storeName": plan["store"]["name"],
        "applications": len(plan["applications"]), "notifications": len(plan["notifications"]),
        "products": [p["name"] for p in plan["products"]], "inventoryRows": len(plan["inventory"]),
        "productImages": len(plan["productImages"]), "materialProducts": len(plan["materialProducts"]),
        "productMedia": len(plan["productMedia"]),
    }


def main():
    parser = argparse.ArgumentParser(description="Revert an approved store application (SELLER -> USER).")
    parser.add_argument("--env-file", required=True, help="EC .env")
    parser.add_argument("--database", required=True, choices=["kusakari", "kusakari_e2e"])
    parser.add_argument("--canvas-env-file", required=True, help="Canvas .env (or .env.e2e)")
    parser.add_argument("--canvas-database", required=True)
    parser.add_argument("--member", required=True, help="email of the SELLER to revert")
    parser.add_argument("--backup", help="JSON file that receives every removed row; required with --apply")
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    if args.apply and not args.backup:
        parser.error("--apply requires --backup")

    env, connection = ec_connection(args)
    try:
        with connection.cursor() as cursor:
            plan, blockers = collect(cursor, env["KUSAKARI_COGNITO_ISSUER"], args.member)
            canvas = canvas_connection(args)
            try:
                blockers += canvas_blockers(canvas, [p["id"] for p in plan["products"]])
            finally:
                canvas.close()
            result = {"dryRun": not args.apply, **summary(plan), "blockers": blockers}
            if blockers or not args.apply:
                print(json.dumps(result, ensure_ascii=False, indent=2))
                if blockers:
                    raise SystemExit(2)
                return
            backup = Path(args.backup)
            backup.parent.mkdir(parents=True, exist_ok=True)
            with backup.open("x", encoding="utf-8") as file:
                json.dump({"database": args.database, **plan}, file, ensure_ascii=False, indent=2,
                          default=serializable)
            apply(cursor, plan)
            connection.commit()
            print(json.dumps({**result, "applied": True, "backup": str(backup)}, ensure_ascii=False, indent=2))
    finally:
        connection.rollback()
        connection.close()


if __name__ == "__main__":
    main()
