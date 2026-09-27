CREATE TABLE "auth_sessions" (
	"token_hash" char(64) PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
