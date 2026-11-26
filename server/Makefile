# Mirrors what CI runs. `make verify` is the gate before calling a task done.
#
# TEST_DATABASE_URL must point at a throwaway database; the tests that need
# one skip without it, so `make test` still says something useful on a machine
# with no Postgres. The dev stack creates notes_test for exactly this.
TEST_DATABASE_URL ?= postgresql://notes:notes@localhost:5432/notes_test

.PHONY: install lint types test verify run seed

install:
	pip install -e ".[dev]"

lint:
	ruff check notes scripts tests

types:
	mypy notes scripts tests

test:
	TEST_DATABASE_URL=$(TEST_DATABASE_URL) pytest -q -W error

verify: lint types test

run:
	uvicorn notes.shared.api.main:create_app --factory --reload --reload-dir notes

seed:
	python scripts/seed.py
