#!/bin/bash

# Скрипт для проверки проекта на наличие дублирующихся функций и файлов

echo "Проверка проекта на наличие лишних файлов и дублирующихся функций..."

# Проверка наличия необходимых директорий и файлов
if [ ! -d "src/constants" ]; then
    echo "ВНИМАНИЕ: Отсутствует директория src/constants. Создайте ее командой: mkdir -p src/constants"
fi

if [ ! -d "src/types" ]; then
    echo "ВНИМАНИЕ: Отсутствует директория src/types. Создайте ее командой: mkdir -p src/types"
fi

if [ ! -f "src/constants/enums.ts" ]; then
    echo "ВНИМАНИЕ: Отсутствует файл src/constants/enums.ts. Этот файл необходим для работы проекта."
    echo "Пожалуйста, создайте его и добавьте необходимые перечисления."
fi

if [ ! -f "src/types/generation.types.ts" ]; then
    echo "ВНИМАНИЕ: Отсутствует файл src/types/generation.types.ts. Этот файл необходим для работы проекта."
    echo "Пожалуйста, создайте его и добавьте необходимые типы для результатов генерации."
fi

# Проверка наличия лишних файлов сервисов
if [ -f "src/services/generate.service.ts" ]; then
    echo "ВНИМАНИЕ: Найден лишний файл src/services/generate.service.ts. Рекомендуется удалить его, так как его функции теперь разделены между специализированными сервисами."
    echo "Выполните: rm src/services/generate.service.ts"
fi

# Проверка импортов generate.service.ts в других файлах
GENERATE_SERVICE_IMPORTS=$(grep -r "import.*generate.service" src/ --include="*.ts" 2>/dev/null || echo "")
if [ ! -z "$GENERATE_SERVICE_IMPORTS" ]; then
    echo "ВНИМАНИЕ: Найдены импорты из generate.service.ts в следующих файлах:"
    echo "$GENERATE_SERVICE_IMPORTS"
    echo "Необходимо заменить их на импорты из соответствующих специализированных сервисов."
fi

# Проверка неправильных импортов констант и типов
CONSTANTS_IMPORTS=$(grep -r "import.*@constants/enums" src/ --include="*.ts" --exclude="*/*.d.ts" 2>/dev/null || echo "")
if [ ! -z "$CONSTANTS_IMPORTS" ]; then
    echo "ВНИМАНИЕ: Найдены прямые импорты из @constants/enums (должны быть относительными) в файлах:"
    echo "$CONSTANTS_IMPORTS"
    echo "Замените на относительные импорты, например, import { ... } from '../constants/enums';"
fi

TYPES_IMPORTS=$(grep -r "import.*@types/generation.types" src/ --include="*.ts" --exclude="*/*.d.ts" 2>/dev/null || echo "")
if [ ! -z "$TYPES_IMPORTS" ]; then
    echo "ВНИМАНИЕ: Найдены прямые импорты из @types/generation.types (должны быть относительными) в файлах:"
    echo "$TYPES_IMPORTS"
    echo "Замените на относительные импорты, например, import { ... } from '../types/generation.types';"
fi

# Проверка дублирования функций
echo "Проверка дублирования кода в сервисах..."

# Проверка дублирования между image.service.ts и video.service.ts
COMMON_FUNCTIONS=$(grep -o "static async [a-zA-Z0-9]\+" src/services/image.service.ts | grep -f - src/services/video.service.ts 2>/dev/null || echo "")
if [ ! -z "$COMMON_FUNCTIONS" ]; then
    echo "Возможно дублирование функций между image.service.ts и video.service.ts:"
    echo "$COMMON_FUNCTIONS"
fi

# Проверка дублирования между image.service.ts и text.service.ts
COMMON_FUNCTIONS=$(grep -o "static async [a-zA-Z0-9]\+" src/services/image.service.ts | grep -f - src/services/text.service.ts 2>/dev/null || echo "")
if [ ! -z "$COMMON_FUNCTIONS" ]; then
    echo "Возможно дублирование функций между image.service.ts и text.service.ts:"
    echo "$COMMON_FUNCTIONS"
fi

# Проверка дублирования между video.service.ts и text.service.ts
COMMON_FUNCTIONS=$(grep -o "static async [a-zA-Z0-9]\+" src/services/video.service.ts | grep -f - src/services/text.service.ts 2>/dev/null || echo "")
if [ ! -z "$COMMON_FUNCTIONS" ]; then
    echo "Возможно дублирование функций между video.service.ts и text.service.ts:"
    echo "$COMMON_FUNCTIONS"
fi

# Проверка наличия типов, которые дублируются в нескольких файлах
echo "Проверка дублирования типов и интерфейсов..."
COMMON_TYPES=$(grep -r "interface [a-zA-Z0-9]\+Result" src/ --include="*.ts" --exclude="src/types/*" | sort | uniq -d 2>/dev/null || echo "")
if [ ! -z "$COMMON_TYPES" ]; then
    echo "Найдены типы с похожими именами в разных файлах (кроме types/):"
    echo "$COMMON_TYPES"
    echo "Рекомендуется переместить их в src/types/generation.types.ts"
fi

# Проверка обновления документации Swagger
SWAGGER_UPDATES=$(grep -r "swagger" src/ --include="*.ts" | grep -v "/docs/" 2>/dev/null || echo "")
if [ ! -z "$SWAGGER_UPDATES" ]; then
    echo "Возможно, нужно обновить документацию Swagger для следующих файлов:"
    echo "$SWAGGER_UPDATES"
fi

# Проверка соответствия build скрипта
BUILD_SCRIPT=$(cat package.json | grep "build" | grep -E "dist/constants|dist/types" || echo "")
if [ -z "$BUILD_SCRIPT" ]; then
    echo "ВНИМАНИЕ: Скрипт build в package.json не содержит команд для создания директорий dist/constants и dist/types."
    echo "Рекомендуемый скрипт build:"
    echo "\"build\": \"tsc && mkdir -p dist/i18n/locales/en && cp src/i18n/locales/en/common.json dist/i18n/locales/en/ && mkdir -p dist/constants && mkdir -p dist/types && cp src/constants/enums.ts dist/constants/ && cp src/types/generation.types.ts dist/types/\","
fi

# Проверка наличия _moduleAliases в package.json
MODULE_ALIASES=$(cat package.json | grep -E "_moduleAliases.*@constants|_moduleAliases.*@types" || echo "")
if [ -z "$MODULE_ALIASES" ]; then
    echo "ВНИМАНИЕ: В package.json не настроены _moduleAliases для @constants и @types."
    echo "Добавьте следующие строки в секцию _moduleAliases в package.json:"
    echo "\"@constants\": \"dist/constants\","
    echo "\"@types\": \"dist/types\","
fi

# Проверка правильности настройки tsconfig.json
TS_CONFIG_PATHS=$(cat tsconfig.json | grep -E "paths.*@constants|paths.*@types" || echo "")
if [ -z "$TS_CONFIG_PATHS" ]; then
    echo "ВНИМАНИЕ: В tsconfig.json не настроены пути для @constants и @types."
    echo "Добавьте следующие строки в секцию paths в tsconfig.json:"
    echo "\"@constants/*\": [\"constants/*\"],"
    echo "\"@types/*\": [\"types/*\"],"
fi

echo "Проверка закончена!"