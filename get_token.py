"""
One-time Google OAuth flow — auto-captures the redirect code via a local server.
No copy-paste needed: just click Allow in the browser and the token is saved.

Usage:  python get_token.py
"""
import json, urllib.parse, urllib.request, webbrowser, threading
from http.server import HTTPServer, BaseHTTPRequestHandler

SECRET_PATH = r"credentials\google-client-secret.json"
TOKEN_PATH  = r"credentials\google-token.json"
SCOPE       = "https://www.googleapis.com/auth/drive.file"
PORT        = 8080   # must be registered in Google Cloud Console as redirect URI

secret        = json.load(open(SECRET_PATH))
creds         = secret.get("installed") or secret.get("web")
client_id     = creds["client_id"]
client_secret = creds["client_secret"]
redirect_uri  = f"http://localhost:{PORT}"

auth_url = (
    "https://accounts.google.com/o/oauth2/auth?"
    + urllib.parse.urlencode({
        "client_id":     client_id,
        "redirect_uri":  redirect_uri,
        "response_type": "code",
        "scope":         SCOPE,
        "access_type":   "offline",
        "prompt":        "consent",
    })
)

captured_code = [None]

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        qs = urllib.parse.urlparse(self.path).query
        params = dict(urllib.parse.parse_qsl(qs))
        code = params.get("code")
        if code:
            captured_code[0] = code
            self.send_response(200)
            self.send_header("Content-Type", "text/html")
            self.end_headers()
            self.wfile.write(b"""
            <html><body style="font-family:sans-serif;text-align:center;padding:60px;background:#f6f8fa">
            <h2 style="color:#1a7f37">&#10003; Authorization successful!</h2>
            <p>You can close this tab. The token is being saved&hellip;</p>
            </body></html>""")
        else:
            self.send_response(400)
            self.end_headers()
            self.wfile.write(b"Missing code parameter")

    def log_message(self, *_):
        pass   # silence request logs

server = HTTPServer(("localhost", PORT), Handler)

def wait_for_code():
    while captured_code[0] is None:
        server.handle_request()

print(f"\n{'='*55}")
print("  GitHub → Google Drive Backup — One-time Auth Setup")
print(f"{'='*55}")
print(f"\nStarting local server on http://localhost:{PORT}")
print("Opening browser for Google authorization...\n")

# NOTE: Add http://localhost:8080 as an Authorised Redirect URI in
# Google Cloud Console → APIs & Services → Credentials → your OAuth client.

webbrowser.open(auth_url)

t = threading.Thread(target=wait_for_code, daemon=True)
t.start()
t.join(timeout=120)

if not captured_code[0]:
    print("\n[ERROR] Timed out waiting for authorization (2 min).")
    print("Make sure you clicked Allow in the browser.")
    raise SystemExit(1)

code = captured_code[0]
print("Authorization code received — exchanging for tokens...")

data = urllib.parse.urlencode({
    "code":          code,
    "client_id":     client_id,
    "client_secret": client_secret,
    "redirect_uri":  redirect_uri,
    "grant_type":    "authorization_code",
}).encode()

try:
    req  = urllib.request.Request("https://oauth2.googleapis.com/token", data=data)
    resp = urllib.request.urlopen(req)
    tokens = json.loads(resp.read())
except urllib.error.HTTPError as e:
    body = e.read().decode()
    print(f"\n[ERROR] Token exchange failed: {e.code} {body}")
    raise SystemExit(1)

with open(TOKEN_PATH, "w") as f:
    json.dump(tokens, f, indent=2)

print(f"\n{'='*55}")
print(f"  Token saved to:  {TOKEN_PATH}")
print(f"{'='*55}")
print("\nNext step: copy the JSON below into the GOOGLE_TOKEN GitHub secret:\n")
print(json.dumps(tokens))
print()
