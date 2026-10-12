-- CreateTable
CREATE TABLE "identity"."IdentityJwks" (
    "id" TEXT NOT NULL,
    "publicKey" TEXT NOT NULL,
    "privateKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "alg" TEXT,
    "crv" TEXT,

    CONSTRAINT "IdentityJwks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identity"."IdentityOAuthClient" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "clientSecret" TEXT,
    "clientDiscoveryId" TEXT,
    "disabled" BOOLEAN DEFAULT false,
    "skipConsent" BOOLEAN,
    "enableEndSession" BOOLEAN,
    "subjectType" TEXT,
    "scopes" JSONB,
    "clientCredentialsScopes" JSONB,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),
    "name" TEXT,
    "uri" TEXT,
    "icon" TEXT,
    "contacts" JSONB,
    "tos" TEXT,
    "policy" TEXT,
    "softwareId" TEXT,
    "softwareVersion" TEXT,
    "softwareStatement" TEXT,
    "redirectUris" TEXT[],
    "postLogoutRedirectUris" JSONB,
    "backchannelLogoutUri" TEXT,
    "backchannelLogoutSessionRequired" BOOLEAN,
    "tokenEndpointAuthMethod" TEXT,
    "applicationType" TEXT,
    "jwks" TEXT,
    "jwksUri" TEXT,
    "grantTypes" JSONB,
    "responseTypes" JSONB,
    "requirePKCE" BOOLEAN,
    "dpopBoundAccessTokens" BOOLEAN,
    "referenceId" TEXT,
    "metadata" JSONB,

    CONSTRAINT "IdentityOAuthClient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identity"."IdentityOAuthResource" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "accessTokenTtl" INTEGER,
    "refreshTokenTtl" INTEGER,
    "signingAlgorithm" TEXT,
    "signingKeyId" TEXT,
    "allowedScopes" JSONB,
    "customClaims" JSONB,
    "dpopBoundAccessTokensRequired" BOOLEAN,
    "disabled" BOOLEAN,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),
    "policyVersion" INTEGER,
    "metadata" JSONB,

    CONSTRAINT "IdentityOAuthResource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identity"."IdentityOAuthClientResource" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdentityOAuthClientResource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identity"."IdentityOAuthRefreshToken" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "sessionId" TEXT,
    "userId" TEXT NOT NULL,
    "referenceId" TEXT,
    "authorizationCodeId" TEXT,
    "resources" JSONB,
    "requestedUserInfoClaims" JSONB,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "revoked" TIMESTAMP(3),
    "rotatedAt" TIMESTAMP(3),
    "rotationReplayResponse" TEXT,
    "rotationReplayExpiresAt" TIMESTAMP(3),
    "authTime" TIMESTAMP(3),
    "confirmation" JSONB,
    "scopes" TEXT[],

    CONSTRAINT "IdentityOAuthRefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identity"."IdentityOAuthAccessToken" (
    "id" TEXT NOT NULL,
    "token" TEXT,
    "clientId" TEXT NOT NULL,
    "sessionId" TEXT,
    "userId" TEXT,
    "referenceId" TEXT,
    "authorizationCodeId" TEXT,
    "resources" JSONB,
    "requestedUserInfoClaims" JSONB,
    "refreshId" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "revoked" TIMESTAMP(3),
    "confirmation" JSONB,
    "scopes" TEXT[],

    CONSTRAINT "IdentityOAuthAccessToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identity"."IdentityOAuthConsent" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "userId" TEXT,
    "referenceId" TEXT,
    "resources" JSONB,
    "requestedUserInfoClaims" JSONB,
    "scopes" TEXT[],
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "IdentityOAuthConsent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identity"."IdentityOAuthClientAssertion" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IdentityOAuthClientAssertion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IdentityOAuthClient_clientId_key" ON "identity"."IdentityOAuthClient"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "IdentityOAuthResource_identifier_key" ON "identity"."IdentityOAuthResource"("identifier");

-- CreateIndex
CREATE INDEX "IdentityOAuthClientResource_clientId_idx" ON "identity"."IdentityOAuthClientResource"("clientId");

-- CreateIndex
CREATE INDEX "IdentityOAuthClientResource_resourceId_idx" ON "identity"."IdentityOAuthClientResource"("resourceId");

-- CreateIndex
CREATE UNIQUE INDEX "IdentityOAuthRefreshToken_token_key" ON "identity"."IdentityOAuthRefreshToken"("token");

-- CreateIndex
CREATE INDEX "IdentityOAuthRefreshToken_userId_idx" ON "identity"."IdentityOAuthRefreshToken"("userId");

-- CreateIndex
CREATE INDEX "IdentityOAuthRefreshToken_clientId_idx" ON "identity"."IdentityOAuthRefreshToken"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "IdentityOAuthAccessToken_token_key" ON "identity"."IdentityOAuthAccessToken"("token");

-- CreateIndex
CREATE INDEX "IdentityOAuthAccessToken_userId_idx" ON "identity"."IdentityOAuthAccessToken"("userId");

-- CreateIndex
CREATE INDEX "IdentityOAuthAccessToken_clientId_idx" ON "identity"."IdentityOAuthAccessToken"("clientId");

-- CreateIndex
CREATE INDEX "IdentityOAuthConsent_userId_idx" ON "identity"."IdentityOAuthConsent"("userId");

-- AddForeignKey
ALTER TABLE "identity"."IdentityOAuthClient" ADD CONSTRAINT "IdentityOAuthClient_userId_fkey" FOREIGN KEY ("userId") REFERENCES "identity"."IdentityUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identity"."IdentityOAuthClientResource" ADD CONSTRAINT "IdentityOAuthClientResource_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "identity"."IdentityOAuthClient"("clientId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identity"."IdentityOAuthClientResource" ADD CONSTRAINT "IdentityOAuthClientResource_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "identity"."IdentityOAuthResource"("identifier") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identity"."IdentityOAuthRefreshToken" ADD CONSTRAINT "IdentityOAuthRefreshToken_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "identity"."IdentityOAuthClient"("clientId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identity"."IdentityOAuthRefreshToken" ADD CONSTRAINT "IdentityOAuthRefreshToken_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "identity"."IdentitySession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identity"."IdentityOAuthRefreshToken" ADD CONSTRAINT "IdentityOAuthRefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "identity"."IdentityUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identity"."IdentityOAuthAccessToken" ADD CONSTRAINT "IdentityOAuthAccessToken_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "identity"."IdentityOAuthClient"("clientId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identity"."IdentityOAuthAccessToken" ADD CONSTRAINT "IdentityOAuthAccessToken_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "identity"."IdentitySession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identity"."IdentityOAuthAccessToken" ADD CONSTRAINT "IdentityOAuthAccessToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "identity"."IdentityUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identity"."IdentityOAuthAccessToken" ADD CONSTRAINT "IdentityOAuthAccessToken_refreshId_fkey" FOREIGN KEY ("refreshId") REFERENCES "identity"."IdentityOAuthRefreshToken"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identity"."IdentityOAuthConsent" ADD CONSTRAINT "IdentityOAuthConsent_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "identity"."IdentityOAuthClient"("clientId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identity"."IdentityOAuthConsent" ADD CONSTRAINT "IdentityOAuthConsent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "identity"."IdentityUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
