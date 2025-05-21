#!/bin/bash

# Обновление конфигурационных файлов и проверка проекта

# Обновление package.json
echo "Обновление package.json..."
if ! grep -q '"@constants": "dist/constants"' package.json; then
  # Проверяем, есть ли секция _moduleAliases в файле
  if grep -q "_moduleAliases" package.json; then
    # Используем sed для добавления двух новых строк после последней существующей строки в _moduleAliases
    sed -i '/\"@i18n\": \"dist\/i18n\"/a \    \"@constants\": \"dist\/constants\",\n    \"@types\": \"dist\/types\"' package.json
    echo "Добавлены алиасы @constants и @types в package.json"
  else
    echo "ВНИМАНИЕ: Секция _moduleAliases не найдена в package.json"
    echo "Пожалуйста, добавьте следующие строки в конец package.json перед последней закрывающей скобкой:"
    echo '"_moduleAliases": {'
    echo '  "@config": "dist/config",'
    echo '  "@utils": "dist/utils",'
    echo '  "@services": "dist/services",'
    echo '  "@routes": "dist/routes",'
    echo '  "@models": "dist/models",'
    echo '  "@middleware": "dist/middleware",'
    echo '  "@controllers": "dist/controllers",'
    echo '  "@i18n": "dist/i18n",'
    echo '  "@constants": "dist/constants",'
    echo '  "@types": "dist/types"'
    echo '}'
  fi
else
  echo "Алиасы @constants и @types уже присутствуют в package.json"
fi

# Обновление tsconfig.json
echo "Обновление tsconfig.json..."
if ! grep -q '"@constants/\*": \["constants/\*"\]' tsconfig.json; then
  # Проверяем, есть ли секция paths в файле
  if grep -q "paths" tsconfig.json; then
    # Используем sed для добавления двух новых строк после последней существующей строки в paths
    sed -i '/\"@i18n\/\*\": \[\"i18n\/\*\"\]/a \      \"@constants\/\*\": \[\"constants\/\*\"\],\n      \"@types\/\*\": \[\"types\/\*\"\]' tsconfig.json
    echo "Добавлены пути @constants/* и @types/* в tsconfig.json"
  else
    echo "ВНИМАНИЕ: Секция paths не найдена в tsconfig.json"
    echo "Пожалуйста, добавьте следующие строки в compilerOptions в tsconfig.json:"
    echo '"paths": {'
    echo '  "@config/*": ["config/*"],'
    echo '  "@utils/*": ["utils/*"],'
    echo '  "@services/*": ["services/*"],'
    echo '  "@routes/*": ["routes/*"],'
    echo '  "@models/*": ["models/*"],'
    echo '  "@middleware/*": ["middleware/*"],'
    echo '  "@controllers/*": ["controllers/*"],'
    echo '  "@i18n/*": ["i18n/*"],'
    echo '  "@constants/*": ["constants/*"],'
    echo '  "@types/*": ["types/*"]'
    echo '}'
  fi
else
  echo "Пути @constants/* и @types/* уже присутствуют в tsconfig.json"
fi

# Проверка наличия необходимых директорий и файлов
echo "Проверка наличия необходимых директорий и файлов..."
if [ ! -d "src/constants" ]; then
  mkdir -p src/constants
  echo "Создана директория src/constants"
fi

if [ ! -d "src/types" ]; then
  mkdir -p src/types
  echo "Создана директория src/types"
fi

if [ ! -f "src/constants/enums.ts" ]; then
  echo "ВНИМАНИЕ: Отсутствует файл src/constants/enums.ts"
  echo "Создайте файл с необходимыми перечислениями"
fi

if [ ! -f "src/types/generation.types.ts" ]; then
  echo "ВНИМАНИЕ: Отсутствует файл src/types/generation.types.ts"
  echo "Создайте файл с типами для результатов генерации"
fi

# Проверка скрипта сборки в package.json
echo "Проверка скрипта сборки..."
if ! grep -q "mkdir -p dist/constants && mkdir -p dist/types" package.json; then
  echo "ВНИМАНИЕ: Скрипт build в package.json не содержит команд для создания директорий dist/constants и dist/types"
  echo "Рекомендуемый скрипт build:"
  echo "\"build\": \"tsc && mkdir -p dist/i18n/locales/en && cp src/i18n/locales/en/common.json dist/i18n/locales/en/ && mkdir -p dist/constants && mkdir -p dist/types && cp src/constants/enums.ts dist/constants/ && cp src/types/generation.types.ts dist/types/\","
else
  echo "Скрипт build в package.json содержит необходимые команды"
fi

echo "Запуск проверки проекта..."
./check-project.sh

echo "Обновление конфигурационных файлов завершено."
echo "Выполните следующие команды для применения изменений:"
echo "npm run build"
echo "pm2 restart contentstar-backend"