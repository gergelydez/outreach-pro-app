"""Audit worker for the UK Business Hunter CRM.

The worker only observes facts about public websites and reports them to the CRM
API. Classification and scoring happen server-side (lib/crm/classify.ts, scoring.ts).
"""
__version__ = "1.0.0"
