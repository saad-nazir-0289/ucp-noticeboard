#!/bin/sh
# Runs once, when the database volume is first created.
set -e
psql -v ON_ERROR_STOP=1 --username postgres <<-SQL
	CREATE DATABASE ucpnb_production;
	CREATE DATABASE ucpnb_staging;
SQL
