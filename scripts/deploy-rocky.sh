#!/usr/bin/env bash
#
# Despliegue de NexusForge OS en Rocky Linux 10 (familia RHEL)
# ============================================================
#
# Deja la aplicacion corriendo como servicio del sistema detras de nginx con
# HTTPS, cortafuegos y SELinux configurados. Es idempotente: se puede volver a
# ejecutar para actualizar sin romper nada.
#
#   sudo bash deploy-rocky.sh
#
# Antes de ejecutarlo tiene que existir el archivo de variables de entorno
# (por defecto /home/ana/nexusforge.env) con las llaves de Supabase. Importa el
# orden: las variables NEXT_PUBLIC_ se incrustan en el codigo del navegador
# durante la construccion, asi que si no estan ANTES de 'npm run build', la
# aplicacion queda construida sin conexion a la base de datos.
#
# Certificado: en esta red no se puede usar Let's Encrypt (Starlink usa CGNAT,
# no hay IP publica que validar), asi que se genera uno autofirmado. El cifrado
# es real; lo unico que falta es que una autoridad publica lo respalde, por eso
# el navegador avisa. En un servidor con IP publica se cambia por:
#   sudo dnf install -y certbot python3-certbot-nginx
#   sudo certbot --nginx -d mi.dominio.hn
#
set -euo pipefail

APP_USER="nexusforge"
APP_HOME="/opt/nexusforge"
APP_DIR="$APP_HOME/app"
REPO="${REPO:-https://github.com/user-ana/NexusForge_Os.git}"
BRANCH="${BRANCH:-main}"
PORT="${PORT:-3000}"
ENV_SRC="${ENV_SRC:-/home/ana/nexusforge.env}"

CRT="/etc/pki/tls/certs/nexusforge.crt"
KEY="/etc/pki/tls/private/nexusforge.key"
PROXY_INC="/etc/nginx/nexusforge-proxy.inc"

log()  { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
fail() { printf '\n\033[1;31mERROR: %s\033[0m\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || fail "Ejecutalo con: sudo bash $0"
[ -f "$ENV_SRC" ]    || fail "Falta el archivo de variables '$ENV_SRC' (llaves de Supabase)."

SERVER_IP="$(hostname -I | awk '{print $1}')"

# ---------------------------------------------------------------------------
log "1/9  Paquetes del sistema"
# ---------------------------------------------------------------------------
# Rocky 10 trae Node.js 22 en AppStream: no hace falta el repositorio de
# NodeSource. (En Rocky 9 habia que habilitar un modulo; RHEL 10 quito la
# modularidad, ahora es un paquete normal.)
dnf install -y nodejs git nginx openssl policycoreutils
command -v npm >/dev/null 2>&1 || dnf install -y npm
node -v && npm -v

# ---------------------------------------------------------------------------
log "2/9  Usuario de servicio (sin shell, sin contrasena)"
# ---------------------------------------------------------------------------
# La aplicacion NO corre como root: si la comprometen, el atacante no hereda
# la maquina.
if ! id -u "$APP_USER" >/dev/null 2>&1; then
  useradd --system --home-dir "$APP_HOME" --create-home --shell /sbin/nologin "$APP_USER"
fi

# ---------------------------------------------------------------------------
log "3/9  Codigo fuente"
# ---------------------------------------------------------------------------
if [ -d "$APP_DIR/.git" ]; then
  sudo -H -u "$APP_USER" git -C "$APP_DIR" fetch --all --prune
  sudo -H -u "$APP_USER" git -C "$APP_DIR" reset --hard "origin/$BRANCH"
else
  install -d -o "$APP_USER" -g "$APP_USER" "$APP_DIR"
  sudo -H -u "$APP_USER" git clone --branch "$BRANCH" "$REPO" "$APP_DIR"
fi

APP_COMMIT="$(sudo -H -u "$APP_USER" git -C "$APP_DIR" rev-parse --short HEAD)"
echo "  desplegando commit $APP_COMMIT ($BRANCH)"

# ---------------------------------------------------------------------------
log "4/9  Variables de entorno"
# ---------------------------------------------------------------------------
install -o "$APP_USER" -g "$APP_USER" -m 600 "$ENV_SRC" "$APP_DIR/.env.local"

# ---------------------------------------------------------------------------
log "5/9  Dependencias y construccion (esto tarda unos minutos)"
# ---------------------------------------------------------------------------
cd "$APP_DIR"

# Ajustes de red antes de instalar. Con los valores por defecto, npm se rinde
# con ETIMEDOUT en un enlace de alta latencia o con microcortes (satelital,
# red compartida del campus): abre demasiadas conexiones en paralelo y espera
# poco. Menos paralelismo y mas paciencia hacen la descarga mas lenta pero
# mucho mas confiable.
sudo -H -u "$APP_USER" npm config set fetch-timeout 600000
sudo -H -u "$APP_USER" npm config set fetch-retries 5
sudo -H -u "$APP_USER" npm config set fetch-retry-maxtimeout 120000
sudo -H -u "$APP_USER" npm config set maxsockets 4

# 'npm ci' y no 'npm install': instala exactamente lo del package-lock.json.
# Con reintentos porque en un enlace inestable una sola pasada puede no bastar;
# la cache de npm conserva lo ya descargado, asi que cada intento avanza mas.
npm_ci_con_reintentos() {
  local intento
  for intento in 1 2 3; do
    if sudo -H -u "$APP_USER" npm ci; then return 0; fi
    echo "  npm ci fallo (intento $intento/3). La cache conserva lo descargado; reintentando..."
    sleep 15
  done
  return 1
}
npm_ci_con_reintentos || fail "npm ci fallo tres veces seguidas. Revisa la conexion a internet."

sudo -H -u "$APP_USER" env NEXT_TELEMETRY_DISABLED=1 npm run build

# ---------------------------------------------------------------------------
log "6/9  Servicio de systemd"
# ---------------------------------------------------------------------------
cat > /etc/systemd/system/nexusforge.service <<EOF
[Unit]
Description=NexusForge OS (Next.js)
Documentation=https://github.com/user-ana/NexusForge_Os
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$APP_USER
WorkingDirectory=$APP_DIR
Environment=NODE_ENV=production
Environment=NEXT_TELEMETRY_DISABLED=1
# Que version corre: en Vercel lo dice la plataforma, aqui lo escribimos nosotros.
# Lo publica /api/health, para poder comparar los dos despliegues de un vistazo.
Environment=APP_COMMIT=$APP_COMMIT
Environment=APP_BRANCH=$BRANCH
EnvironmentFile=$APP_DIR/.env.local
# --hostname 127.0.0.1 es lo que deja la aplicacion inalcanzable desde fuera:
# sin esa bandera Next escucha en 0.0.0.0 y el puerto $PORT quedaria expuesto.
ExecStart=$APP_DIR/node_modules/.bin/next start --hostname 127.0.0.1 --port $PORT
Restart=always
RestartSec=5

# Endurecimiento
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=$APP_DIR/.next

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable nexusforge
systemctl restart nexusforge

# ---------------------------------------------------------------------------
log "7/9  Certificado TLS autofirmado"
# ---------------------------------------------------------------------------
if [ ! -f "$CRT" ] || [ ! -f "$KEY" ]; then
  openssl req -x509 -nodes -newkey rsa:2048 -days 825 \
    -keyout "$KEY" -out "$CRT" \
    -subj "/C=HN/ST=Cortes/L=San Pedro Sula/O=UTH/OU=NexusForge OS/CN=nexusforge.local" \
    -addext "subjectAltName=DNS:nexusforge.local,DNS:localhost,IP:$SERVER_IP,IP:127.0.0.1"
  chmod 600 "$KEY"
  # Etiquetas de SELinux correctas para que nginx pueda leerlos
  restorecon -F "$CRT" "$KEY"
fi

# ---------------------------------------------------------------------------
log "8/9  nginx como proxy inverso"
# ---------------------------------------------------------------------------
# En Rocky la configuracion va en /etc/nginx/conf.d/ — 'sites-available' y
# 'sites-enabled' son de Debian/Ubuntu y aqui no existen.
cat > "$PROXY_INC" <<EOF
proxy_pass         http://127.0.0.1:$PORT;
proxy_http_version 1.1;
proxy_set_header   Upgrade \$http_upgrade;
proxy_set_header   Connection 'upgrade';
proxy_set_header   Host \$host;
proxy_set_header   X-Real-IP \$remote_addr;
# X-Forwarded-For es la cabecera que lee clientIp() en src/backend/apiGuard.ts
# para limitar intentos por IP. Sin ella todas las peticiones parecerian venir
# del proxy y el limite anti fuerza bruta bloquearia a todos a la vez.
proxy_set_header   X-Forwarded-For \$proxy_add_x_forwarded_for;
proxy_set_header   X-Forwarded-Proto \$scheme;
proxy_cache_bypass \$http_upgrade;
proxy_read_timeout 320s;
EOF

cat > /etc/nginx/conf.d/nexusforge.conf <<EOF
server {
    listen      80;
    listen      [::]:80;
    server_name _;

    location / {
        include $PROXY_INC;
    }
}

server {
    listen      443 ssl;
    listen      [::]:443 ssl;
    http2       on;
    server_name _;

    ssl_certificate     $CRT;
    ssl_certificate_key $KEY;
    ssl_protocols       TLSv1.2 TLSv1.3;

    location / {
        include $PROXY_INC;
    }
}
EOF

nginx -t
systemctl enable --now nginx
systemctl reload nginx

# ---------------------------------------------------------------------------
log "9/9  SELinux y cortafuegos"
# ---------------------------------------------------------------------------
# SIN esto nginx responde 502 aunque todo lo demas este bien: SELinux prohibe
# por defecto que un proceso web abra conexiones de red. Se ajusta el booleano,
# NO se desactiva SELinux.
setsebool -P httpd_can_network_connect 1

systemctl enable --now firewalld
firewall-cmd --permanent --add-service=http  >/dev/null
firewall-cmd --permanent --add-service=https >/dev/null
firewall-cmd --reload
# El puerto $PORT no se abre a proposito: la aplicacion solo escucha en
# 127.0.0.1 y la unica puerta publica es nginx.

# ---------------------------------------------------------------------------
log "Comprobacion"
# ---------------------------------------------------------------------------
sleep 3
echo "--- directo a la aplicacion (127.0.0.1:$PORT) ---"
curl -fsS "http://127.0.0.1:$PORT/api/health" | head -c 300 || echo "FALLO"
echo
echo "--- a traves de nginx por HTTPS ---"
curl -fsSk "https://127.0.0.1/api/health" | head -c 300 || echo "FALLO"
echo
printf '\n\033[1;32mListo.\033[0m  http://%s   https://%s\n\n' "$SERVER_IP" "$SERVER_IP"
systemctl --no-pager --lines=0 status nexusforge nginx || true
