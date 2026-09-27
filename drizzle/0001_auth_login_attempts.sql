CREATE TABLE "auth_login_attempts" (
	"bucket" char(64) PRIMARY KEY NOT NULL,
	"failures" integer NOT NULL,
	"window_started_at" timestamp with time zone NOT NULL
);
