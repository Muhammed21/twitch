const [mode] = process.argv.slice(2);
const {
  PAYLOAD_API_BASE_URL: baseUrl,
  PAYLOAD_SERVICE_SECRET: secret,
  PAYLOAD_ACTING_USER_PRIVATE_KEY: privateKey,
} = process.env;

const base64url = (bytes) => Buffer.from(bytes).toString("base64url");
const encode = (value) => base64url(JSON.stringify(value));

const signActingUser = async () => {
  const key = await crypto.subtle.importKey(
    "jwk",
    JSON.parse(privateKey),
    { name: "Ed25519" },
    false,
    ["sign"],
  );
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${encode({ alg: "EdDSA", typ: "acting-user+jwt" })}.${encode({
    sub: crypto.randomUUID(),
    iss: "payload",
    aud: "twitch-api:admin",
    iat: now,
    exp: now + 60,
  })}`;
  const signature = await crypto.subtle.sign("Ed25519", key, new TextEncoder().encode(unsigned));
  return `${unsigned}.${base64url(new Uint8Array(signature))}`;
};

const headersFor = {
  signed: async () => ({
    authorization: `Service ${secret}`,
    "x-acting-user": await signActingUser(),
  }),
  unsigned: async () => ({ authorization: `Service ${secret}` }),
  "wrong-secret": async () => ({
    authorization: "Service secret-qui-n-est-pas-celui-du-compte-de-service",
    "x-acting-user": await signActingUser(),
  }),
};

const response = await fetch(`${baseUrl}/v1/admin/channels/${crypto.randomUUID()}/bans`, {
  method: "POST",
  headers: { "content-type": "application/json", ...(await headersFor[mode]()) },
  body: "{}",
});
console.log(response.status);
