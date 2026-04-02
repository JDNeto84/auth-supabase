#!/usr/bin/env python3
import os
import sys
import json
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError


def load_env(paths=(".env", "../.env")):
    for path in paths:
        if os.path.isfile(path):
            with open(path, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if not line or line.startswith("#"):
                        continue
                    if "=" not in line:
                        continue
                    k, v = line.split("=", 1)
                    k = k.strip()
                    v = v.strip().strip('"').strip("'")
                    os.environ.setdefault(k, v)
            return


def post_json(url, headers, payload):
    data = json.dumps(payload).encode("utf-8")
    req = Request(url, data=data, headers=headers, method="POST")
    try:
        with urlopen(req) as resp:
            return resp.read().decode("utf-8"), resp.getcode()
    except HTTPError as e:
        try:
            body = e.read().decode("utf-8")
        except Exception:
            body = ""
        return body or str(e), e.code
    except URLError as e:
        return str(e), None


def main():
    load_env()

    SUPABASE_URL = os.getenv("SUPABASE_URL")
    SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY")
    EMAIL = os.getenv("EMAIL")
    PASSWORD = os.getenv("PASSWORD")

    if not SUPABASE_URL:
        print(
            "Erro: SUPABASE_URL não definido. Defina em .env ou nas variáveis de ambiente.",
            file=sys.stderr,
        )
        sys.exit(1)
    if not SUPABASE_ANON_KEY:
        print(
            "Erro: SUPABASE_ANON_KEY não definido. Defina em .env ou nas variáveis de ambiente.",
            file=sys.stderr,
        )
        sys.exit(1)
    if not EMAIL or not PASSWORD:
        print(
            "Erro: EMAIL ou PASSWORD não definidos. Defina em .env ou nas variáveis de ambiente.",
            file=sys.stderr,
        )
        sys.exit(1)

    url = f"{SUPABASE_URL.rstrip('/')}/auth/v1/token?grant_type=password"
    headers = {
        "apikey": SUPABASE_ANON_KEY,
        "Content-Type": "application/json",
    }
    payload = {"email": EMAIL, "password": PASSWORD}

    body, status = post_json(url, headers, payload)
    try:
        parsed = json.loads(body)
        token = parsed.get("access_token")
        if token:
            print(token)
        else:
            print(json.dumps(parsed, indent=2, ensure_ascii=False))
    except Exception:
        print(body)
    if status and status >= 400:
        sys.exit(1)


if __name__ == "__main__":
    main()
