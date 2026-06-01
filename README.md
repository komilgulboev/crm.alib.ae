This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started
Email:    admin@alib.ae
Пароль:   Admin123!
First, run the development server:

# Терминал 1
cd c:\Users\kgulboev\Projects\Alib\crm.alib.ae\backend; go run ./cmd/server

# Терминал 2
cd c:\Users\kgulboev\Projects\Alib\crm.alib.ae\frontend; npm run dev

1. На локальной машине — собрать фронтенд

cd c:\Users\kgulboev\Projects\Alib\crm.alib.ae\frontend
npm run build

# Создаст папку frontend/dist/
2. Собрать бэкенд под Linux (cross-compile)

cd c:\Users\kgulboev\Projects\Alib\crm.alib.ae\backend
$env:GOOS="linux"; $env:GOARCH="amd64"; go build -o crm-server ./cmd/server
3. Загрузить на сервер

# Создать папку на сервере
ssh user@your-server "mkdir -p /opt/alib-crm"

# Загрузить бинарник и фронтенд
scp crm-server user@your-server:/opt/alib-crm/
scp -r frontend/dist user@your-server:/opt/alib-crm/
4. На сервере — создать .env

ssh user@your-server
cat > /opt/alib-crm/.env << 'EOF'
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=STRONG_PASSWORD
DB_NAME=alib_crm
JWT_SECRET=LONG_RANDOM_SECRET_HERE
PORT=8080
CORS_ORIGIN=https://crm.alib.ae

MINIO_ENDPOINT=localhost:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=STRONG_MINIO_PASSWORD
MINIO_BUCKET=alib-crm-cargo
MINIO_USE_SSL=false

ANTHROPIC_API_KEY=sk-ant-...
EOF
5. Создать systemd-сервис

sudo tee /etc/systemd/system/alib-crm.service << 'EOF'
[Unit]
Description=Alib CRM
After=network.target postgresql.service

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/alib-crm
EnvironmentFile=/opt/alib-crm/.env
ExecStart=/opt/alib-crm/crm-server
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable alib-crm
sudo systemctl start alib-crm
6. Nginx как reverse proxy (если нужен HTTPS)

server {
    listen 80;
    server_name crm.alib.ae;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name crm.alib.ae;

    ssl_certificate     /etc/letsencrypt/live/crm.alib.ae/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/crm.alib.ae/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        client_max_body_size 50M;
    }
}
Структура на сервере после деплоя

/opt/alib-crm/
├── crm-server      ← Go-бинарник
├── .env            ← переменные окружения
└── dist/           ← собранный фронтенд
    ├── index.html
    └── assets/
Обновление (следующие разы)

# Пересобрать всё
cd frontend && npm run build
cd ../backend && $env:GOOS="linux"; $env:GOARCH="amd64"; go build -o crm-server ./cmd/server

# Загрузить и перезапустить
scp crm-server user@your-server:/opt/alib-crm/
scp -r frontend/dist user@your-server:/opt/alib-crm/
ssh user@your-server "sudo systemctl restart alib-crm"
GORM AutoMigrate при каждом запуске сам обновляет схему БД — новые поля (например priority) добавятся автоматически.