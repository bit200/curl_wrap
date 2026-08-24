DOMAIN=curl-proxy.212-8-247-141.sslip.io
PORT=8112

sudo apt update
sudo apt install certbot python3-certbot-nginx python3-certbot-apache -y

sudo mkdir -p /var/www/letsencrypt

# nginx: снаружи 80/443 без порта, внутрь — на локальный $PORT.
# Заголовки Upgrade/Connection обязательны для socket.io (websocket transport).
sudo tee /etc/nginx/sites-enabled/$DOMAIN > /dev/null << NGINX
server {
    listen 80;
    server_name $DOMAIN;

    location / {
        proxy_pass http://127.0.0.1:$PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 120s;
        proxy_send_timeout 120s;
    }
}
NGINX

# 1. Temporarily stop Nginx to free up port 80
sudo systemctl stop nginx

# 2. Run Certbot in standalone mode
sudo certbot certonly --standalone -d $DOMAIN

# 3. Start Nginx back up
sudo systemctl start nginx
