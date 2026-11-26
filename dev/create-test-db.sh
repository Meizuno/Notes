#!/bin/sh
# Creates the throwaway database the server's DB tests use, once, when the dev
# cluster is first initialised: the tests truncate whatever they are pointed at,
# so they get a database of their own rather than the dev one.
set -e
psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" <<SQL
CREATE DATABASE notes_test OWNER "$POSTGRES_USER";
SQL
