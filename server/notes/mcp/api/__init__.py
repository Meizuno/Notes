"""Empty on purpose — the router aggregator lives in router.py beside this file.

Importing any module under api/ (a dependency, a schema) must not import every
route of the module; an inert __init__ keeps that free of cycles. See AGENTS.md.
"""
