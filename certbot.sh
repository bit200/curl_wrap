sudo apt update
sudo apt install certbot python3-certbot-nginx python3-certbot-apache -y

sudo mkdir -p /var/www/letsencrypt

sudo tee /etc/nginx/sites-enabled/curl.itrum.ru > /dev/null << 'EOF'
server {
    listen 80;
    server_name curl.itrum.ru;

    location / {
        proxy_pass http://127.0.0.1:8112;
    }
}
EOF


# 1. Temporarily stop Nginx to free up port 80
sudo systemctl stop nginx

# 2. Run Certbot in standalone mode
sudo certbot certonly --standalone -d curl.itrum.ru

# 3. Start Nginx back up
sudo systemctl start nginx
