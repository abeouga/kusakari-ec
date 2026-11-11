#!/bin/bash
# schema.sql のテーブルを作り、cases.txt の操作を1件ずつ実行して、通る・拒否されるが期待どおりかを数える。
# 使い捨ての MySQL（既定は 127.0.0.1:33999）だけに接続する。開発用・E2E 用の MySQL（3306）には接続しない。
# 立て方は README.md を参照。
cd "$(dirname "$0")"
MYSQL_BIN="${MYSQL_BIN:-/c/Program Files/MySQL/MySQL Server 8.0/bin/mysql.exe}"
PORT="${V3_CHECK_PORT:-33999}"
if [ "$PORT" = 3306 ]; then echo "3306 は開発用の MySQL なので実行しません"; exit 1; fi
M=("$MYSQL_BIN" --no-defaults -h 127.0.0.1 -P "$PORT" -u root --default-character-set=utf8mb4)
"${M[@]}" -e "DROP DATABASE IF EXISTS kusakari_v3_check; CREATE DATABASE kusakari_v3_check CHARACTER SET utf8mb4" || exit 1
"${M[@]}" kusakari_v3_check < schema.sql || { echo "DDL FAILED"; exit 1; }
echo "DDL OK: $("${M[@]}" -N -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='kusakari_v3_check'") tables"
# 値の確認用。偽（0）や NULL を入れると CHECK 制約で拒否される
"${M[@]}" kusakari_v3_check -e "CREATE TABLE t_assert (ok INT NOT NULL, CONSTRAINT ck_assert CHECK (ok = 1))" || exit 1
pass=0; fail=0; n=0
while IFS='|' read -r expect title sql; do
  [ -z "$expect" ] && continue
  n=$((n+1))
  out=$("${M[@]}" kusakari_v3_check -e "$sql" 2>&1); rc=$?
  if { [ "$expect" = OK ] && [ $rc -eq 0 ]; } || { [ "$expect" = NG ] && [ $rc -ne 0 ]; }; then
    pass=$((pass+1)); msg=""
    # 拒否の理由（エラー番号と、制約名を含む文）を残す。別の理由で失敗していないかを結果で確かめるため
    [ "$expect" = NG ] && msg="  <- $(echo "$out" | grep -o 'ERROR [0-9]*.*' | head -1 | sed -E 's/ \([0-9A-Z]+\) at line [0-9]+//' | cut -c1-150)"
    echo "PASS $n [$expect] $title$msg"
  else
    fail=$((fail+1)); echo "FAIL $n [$expect] $title"; echo "     $out" | head -3
  fi
done < cases.txt
echo "== pass=$pass fail=$fail total=$n"
[ $fail -eq 0 ]
