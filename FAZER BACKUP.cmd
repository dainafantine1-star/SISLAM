@echo off
cd /d "%~dp0"
echo Feche a janela do SISLAM antes de executar este backup.
echo O backup inclui dados e anexos de todos os municipios da base local.
node node_modules/tsx/dist/cli.mjs scripts/backup.ts
pause
