---
noteId: "7dc1e460952a11f194c22d32e32ad913"
tags: []

---

# Despliegue — NexusForge OS sobre servidor Linux

**Asignatura:** Programación para Sistemas Abiertos II · **Etapa:** Tercer Parcial (Despliegue y Mantenimiento)

Documento que responde a dos exigencias del marco de trabajo del curso:

> "…desarrollo de una aplicación web o aplicación móvil funcional, **basada en servidor Linux**."
>
> "1. Despliegue — Configuración de servidores locales o servicios en la nube. Publicación en producción con **dominio y certificados de seguridad** o servicio equivalente."

---

## 1. Respuesta corta: ¿dónde está el Linux del proyecto?

**Las tres capas del sistema corren sobre Linux.** No hay ninguna pieza del servidor en Windows: Windows es solo la máquina de desarrollo.

| Capa | Qué corre | Sistema operativo |
|---|---|---|
| Aplicación (Next.js / Node.js) | Funciones del servidor y renderizado | **Linux** (Amazon Linux 2023 en Vercel) |
| Base de datos | PostgreSQL 15 + autenticación + almacenamiento | **Linux** (Debian, infraestructura de Supabase) |
| Servidor de IA | Ollama con Llama 3.2 | **Linux** (o Windows/WSL2 en la demo local) |

Esto **no es una afirmación de papel**: el endpoint `/api/health` lo publica en vivo, leído del propio sistema operativo del servidor con el módulo `os` de Node.

```bash
curl https://nexusforgeos.vercel.app/api/health
```

```json
{
  "status": "ok",
  "runtime": {
    "platform": "linux",
    "release": "5.10.0-x86_64",
    "arch": "x64",
    "node": "v22.x",
    "cpus": 2,
    "uptimeSeconds": 1843,
    "memory": { "rssMB": 118, "usedMB": 512, "totalMB": 2048 },
    "region": "iad1"
  },
  "checks": [
    { "name": "database", "ok": true, "ms": 63 },
    { "name": "ai", "ok": false, "ms": 2001, "detail": "no alcanzable" }
  ],
  "version": { "env": "production", "commit": "cdc716b" }
}
```

El mismo dato se ve en el panel **Monitoreo** del catedrático, en la tarjeta *Sistema*. Para la exposición, esa captura es la prueba de que la solución corre sobre Linux.

---

## 2. Cómo está desplegado hoy (producción)

| Requisito del parcial | Cómo se cumple |
|---|---|
| Servicio en la nube | Vercel (funciones Node.js sobre Linux) |
| Dominio | `nexusforgeos.vercel.app` |
| Certificado de seguridad | TLS emitido y renovado automáticamente (HTTPS forzado, HSTS) |
| Base de datos en producción | Supabase — PostgreSQL gestionado con RLS por rol |
| Despliegue continuo | `git push` a `main` → build → publicación automática |
| Variables de entorno | Configuradas en el panel de Vercel, nunca en el repositorio |

### Variables de entorno de producción

```
NEXT_PUBLIC_SUPABASE_URL         URL del proyecto Supabase
NEXT_PUBLIC_SUPABASE_ANON_KEY    Llave pública (el navegador la usa; RLS la limita)
SUPABASE_SERVICE_ROLE_KEY        Llave del servidor — SOLO servidor. Rol docente y métricas
TEACHER_KEY_HASH                 SHA-256 de la clave institucional de catedrático
OLLAMA_BASE_URL                  URL del servidor de IA
OLLAMA_MODEL                     llama3.2
METRICS_ENABLED                  true | false — interruptor del monitoreo
```

---

## 3. Despliegue en servidor Linux propio (Rocky Linux 10)

Receta reproducible para ver la aplicación corriendo en una máquina Linux administrada por
nosotros: VPS, servidor del laboratorio o máquina virtual. **Probada sobre Rocky Linux 10.2
"Red Quartz"** (kernel 6.12, familia RHEL — el mismo mundo que AlmaLinux, CentOS Stream y Fedora
Server).

> **Todo esto está automatizado en [`scripts/deploy-rocky.sh`](../scripts/deploy-rocky.sh)**, que
> es idempotente (se puede volver a ejecutar para actualizar). Esta sección explica **qué hace y
> por qué**, que es lo que hay que poder defender en la exposición; el script solo lo ejecuta sin
> equivocarse.
>
> ```bash
> sudo bash deploy-rocky.sh
> ```

La arquitectura es siempre la misma, sin importar la distribución:

```
Internet ──HTTPS(443)──> nginx ──HTTP(127.0.0.1:3000)──> Node.js (Next.js) ──> PostgreSQL
           certificado    proxy      solo local           servicio systemd       (Supabase)
           Let's Encrypt  inverso                         se reinicia solo
```

Tres ideas que hay que poder explicar en la exposición:

1. **Node no se expone a Internet.** Escucha solo en `127.0.0.1:3000`. La única puerta pública es
   nginx en los puertos 80/443. Si alguien escanea el servidor, el 3000 está cerrado.
2. **La aplicación no corre como root.** Corre como un usuario de servicio sin shell. Si la
   comprometen, el atacante no hereda la máquina.
3. **systemd la mantiene viva.** Arranca sola al encender el servidor y se reinicia si se cae.

> **Diferencias con Ubuntu:** Rocky usa `dnf` en vez de `apt`, `firewalld` en vez de `ufw`,
> `/etc/nginx/conf.d/` en vez de `sites-available/sites-enabled`, y **trae SELinux activado**,
> que es el punto donde más gente se atora (sección 3.5). Hay una tabla de equivalencias al final.

### 3.1 Preparar el sistema

```bash
sudo dnf update -y
sudo dnf install -y nodejs git nginx openssl policycoreutils

node -v && npm -v      # v22.23.1 en Rocky 10.2

# Usuario de servicio: sin contraseña y sin shell (no puede iniciar sesión)
sudo useradd --system --home-dir /opt/nexusforge --create-home --shell /sbin/nologin nexusforge
```

**Rocky 10 trae Node.js 22 LTS en el repositorio AppStream**, así que no hace falta agregar el
repositorio de NodeSource. Dos cambios respecto a Rocky 9 que confunden si se sigue un tutorial
viejo:

- **La modularidad de `dnf` desapareció.** En Rocky 9 se hacía `dnf module enable nodejs:22`;
  en RHEL 10 los módulos se retiraron y Node es un paquete normal. `dnf module list` ahora avisa
  que está obsoleto.
- **EPEL ya viene habilitado** en esta instalación. Si en otra máquina no lo está, hace falta para
  certbot: `sudo dnf install -y epel-release`.

### 3.2 Traer el código y construir

```bash
sudo -u nexusforge git clone https://github.com/user-ana/NexusForge_Os.git /opt/nexusforge/app
cd /opt/nexusforge/app
sudo -u nexusforge npm ci
sudo -u nexusforge cp .env.example .env.local   # y editarlo con las llaves reales
sudo chmod 600 /opt/nexusforge/app/.env.local   # las llaves no las lee nadie más
sudo -u nexusforge npm run build
```

> `npm ci` y no `npm install`: instala exactamente lo que dice `package-lock.json`. En un servidor
> de producción no se quieren versiones distintas a las que se probaron.

### 3.3 Servicio del sistema (arranca solo y se reinicia si se cae)

`/etc/systemd/system/nexusforge.service`

```ini
[Unit]
Description=NexusForge OS (Next.js)
After=network.target

[Service]
Type=simple
User=nexusforge
WorkingDirectory=/opt/nexusforge/app
Environment=NODE_ENV=production
EnvironmentFile=/opt/nexusforge/app/.env.local
# --hostname 127.0.0.1 es lo que deja la aplicación inalcanzable desde fuera:
# sin esa bandera, Next escucha en 0.0.0.0 y el puerto 3000 quedaría expuesto.
ExecStart=/opt/nexusforge/app/node_modules/.bin/next start --hostname 127.0.0.1 --port 3000
Restart=always
RestartSec=5
# Endurecimiento básico
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ReadWritePaths=/opt/nexusforge/app/.next

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now nexusforge     # 'enable' = arranca sola al encender el servidor
sudo systemctl status nexusforge
sudo journalctl -u nexusforge -f           # los logs de la aplicación, en vivo
```

> Dos detalles de `EnvironmentFile`: systemd **no** interpreta comillas como el shell ni permite
> `export`. Escribir `CLAVE=valor` sin comillas. Y si el archivo no existe, el servicio no arranca.

### 3.4 Nginx como proxy inverso

En Rocky **no existe** `sites-available` / `sites-enabled`: eso es de Debian/Ubuntu. Aquí el
archivo va directo en `/etc/nginx/conf.d/` y se carga solo por estar ahí.

`/etc/nginx/conf.d/nexusforge.conf`

```nginx
server {
    listen 80;
    server_name nexusforge.midominio.hn;

    location / {
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection 'upgrade';
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
sudo nginx -t                      # valida la sintaxis antes de aplicar
sudo systemctl enable --now nginx
sudo systemctl reload nginx
```

> `X-Forwarded-For` importa: es la cabecera que lee `clientIp()` en `src/backend/apiGuard.ts`
> para limitar intentos por IP. Sin ella, todas las peticiones parecerían venir del proxy y el
> límite anti fuerza bruta bloquearía a todos los usuarios a la vez.

### 3.5 SELinux — el paso que nadie espera

Rocky trae **SELinux en modo `enforcing`** de fábrica. Entre otras cosas, prohíbe que un proceso
web abra conexiones de red por su cuenta. Resultado: nginx queda perfectamente configurado y aun
así el navegador muestra **502 Bad Gateway**, sin ningún error en la configuración de nginx.

```bash
getenforce                                   # -> Enforcing

# Permitir que nginx hable con la aplicación en 127.0.0.1:3000
sudo setsebool -P httpd_can_network_connect 1
getsebool httpd_can_network_connect          # -> on
```

Cómo confirmar que el bloqueo era SELinux y no otra cosa:

```bash
sudo ausearch -m AVC -ts recent              # muestra las denegaciones recientes
```

> **No desactivar SELinux** (`setenforce 0`) para "arreglarlo". Ajustar el booleano es la respuesta
> correcta y es justo el tipo de detalle que distingue un despliegue entendido de uno copiado.
> El `-P` hace el cambio permanente entre reinicios.

### 3.6 Cortafuegos (firewalld)

Rocky usa `firewalld`, no `ufw`:

```bash
sudo systemctl enable --now firewalld
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --reload
sudo firewall-cmd --list-all
```

Nótese que **el puerto 3000 nunca se abre**. Node solo escucha en `127.0.0.1`, así que es
inalcanzable desde fuera: la única entrada son los puertos 80 y 443 de nginx.

### 3.7 Certificado de seguridad (HTTPS)

Hay dos caminos y **cuál toca depende de si el servidor tiene IP pública**, no de preferencia.

**Caso A — servidor con IP pública y dominio: Let's Encrypt.**

```bash
sudo dnf install -y certbot python3-certbot-nginx
sudo certbot --nginx -d nexusforge.midominio.hn
sudo systemctl list-timers | grep certbot     # certbot instala su renovación
sudo certbot renew --dry-run
```

Certbot edita `/etc/nginx/conf.d/nexusforge.conf` solo: agrega el bloque `listen 443 ssl`, las
rutas del certificado y la redirección de 80 a 443.

**Caso B — red doméstica o del laboratorio: certificado autofirmado.**

Es el caso de esta instalación. La máquina sale por **Starlink, que usa CGNAT**: no tiene IP
pública propia, así que los servidores de Let's Encrypt no pueden alcanzarla por el puerto 80 para
comprobar que el dominio es nuestro. `certbot` fallaría siempre, y no por estar mal configurado.

```bash
sudo openssl req -x509 -nodes -newkey rsa:2048 -days 825 \
  -keyout /etc/pki/tls/private/nexusforge.key \
  -out    /etc/pki/tls/certs/nexusforge.crt \
  -subj "/C=HN/O=UTH/CN=nexusforge.local" \
  -addext "subjectAltName=DNS:nexusforge.local,IP:192.168.1.29"
sudo chmod 600 /etc/pki/tls/private/nexusforge.key
sudo restorecon -F /etc/pki/tls/certs/nexusforge.crt /etc/pki/tls/private/nexusforge.key
```

> **Qué decir si lo preguntan en la exposición:** el cifrado es exactamente el mismo — TLS 1.2/1.3
> real, el tráfico va cifrado. Lo único que falta es que una autoridad certificadora pública
> respalde la identidad del servidor, y por eso el navegador advierte. Un certificado autofirmado
> no es "HTTPS de mentira": es HTTPS sin tercero que dé fe. Para un servidor que no está publicado
> en Internet no hay alternativa, y por eso la producción real está en Vercel, que sí tiene dominio
> y certificado válido.

El `restorecon` no es opcional: sin la etiqueta correcta de SELinux, nginx no puede leer el
certificado y no arranca.

### 3.8 Sonda de disponibilidad

El endpoint `/api/health` devuelve **200** si la base responde y **503** si no. Sirve tal cual
para una sonda externa (UptimeRobot, Better Stack) o para vigilarse a sí mismo con un temporizador
de systemd, más idiomático en Rocky que un cron:

`/etc/systemd/system/nexusforge-health.service`

```ini
[Unit]
Description=Sonda de salud de NexusForge OS

[Service]
Type=oneshot
ExecStart=/bin/sh -c 'curl -fsS -o /dev/null http://127.0.0.1:3000/api/health || systemctl restart nexusforge'
```

> Como `/api/health` responde **503** cuando la base de datos no contesta, `curl -f` falla y el
> servicio se reinicia solo. Esa es la diferencia entre "la aplicación está encendida" y "la
> aplicación está sirviendo": un proceso puede estar vivo y aun así no servir para nada.

`/etc/systemd/system/nexusforge-health.timer`

```ini
[Unit]
Description=Revisa la salud de NexusForge cada 5 minutos

[Timer]
OnBootSec=2min
OnUnitActiveSec=5min

[Install]
WantedBy=timers.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now nexusforge-health.timer
sudo systemctl list-timers nexusforge-health.timer
```

### 3.9 Servidor de IA en la misma máquina (opcional)

```bash
curl -fsSL https://ollama.com/install.sh | sh    # instala y crea el servicio systemd
sudo systemctl enable --now ollama
ollama pull llama3.2
# En .env.local:  OLLAMA_BASE_URL=http://127.0.0.1:11434
```

Igual que la aplicación: Ollama escucha solo en local y no se abre en el cortafuegos.

### 3.10 Equivalencias Rocky Linux ↔ Ubuntu

Por si se despliega en la otra familia; la arquitectura no cambia, solo los comandos.

| Tarea | Rocky Linux 10 (RHEL) | Ubuntu 24.04 (Debian) |
|---|---|---|
| Instalar paquetes | `dnf install` | `apt install` |
| Actualizar | `dnf update` | `apt update && apt upgrade` |
| Node.js 22 | Ya está en AppStream | Repositorio de NodeSource |
| Repositorio extra | `epel-release` (para certbot) | (no hace falta) |
| Configuración de nginx | `/etc/nginx/conf.d/*.conf` | `sites-available` + enlace a `sites-enabled` |
| Usuario de nginx | `nginx` | `www-data` |
| Cortafuegos | `firewall-cmd` | `ufw` |
| SELinux | **Activo** — `setsebool -P httpd_can_network_connect 1` | AppArmor, no estorba aquí |
| Crear usuario de servicio | `useradd --system` | `adduser --system` |
| Servicio del sistema | `systemctl` (igual) | `systemctl` (igual) |
| Logs | `journalctl -u servicio` (igual) | `journalctl -u servicio` (igual) |

### 3.11 Si algo falla

| Síntoma | Causa más probable | Comprobación |
|---|---|---|
| 502 Bad Gateway | SELinux bloquea el proxy | `sudo setsebool -P httpd_can_network_connect 1` |
| 502 y SELinux ya está permitido | La aplicación no está arriba | `systemctl status nexusforge` · `curl localhost:3000` |
| El servicio no arranca | Falta `.env.local` o tiene comillas | `journalctl -u nexusforge -n 50` |
| No se llega desde fuera | Cortafuegos cerrado | `sudo firewall-cmd --list-all` |
| Certbot falla | El dominio no apunta al servidor todavía | `dig +short nexusforge.midominio.hn` |
| El panel de Monitoreo sale vacío | Falta ejecutar `supabase/metrics.sql` | Ver [MONITOREO.md](MONITOREO.md) |

---

## 4. Qué recomendar en la presentación

La estrategia de menor riesgo para el Tercer Parcial es **presentar las dos**:

1. **Producción real:** Vercel + Supabase, con dominio y HTTPS ya funcionando y accesible desde
   cualquier lugar. Es lo que el catedrático puede abrir en su celular durante la exposición.
2. **Dominio del despliegue Linux:** la sección 3 de este documento, mostrando `systemctl status`,
   la configuración de Nginx y el certificado de Let's Encrypt. Demuestra que se entiende qué hace
   la nube por debajo, que es justamente el objetivo del curso.

Y el argumento que une las dos: **`/api/health` dice `"platform": "linux"` en ambos casos**.

---

## 5. Mantenimiento y evolución (punto 2 del Tercer Parcial)

| Requisito | Estado | Dónde |
|---|---|---|
| Corrección de errores y parches de seguridad | Hecho | `supabase/security_patch.sql`, `npm run security:test`, `npm run security:api` |
| Incorporación de nuevas funcionalidades | Continuo | Historial de commits del repositorio |
| **Monitoreo de métricas y rendimiento** | **Hecho** | Panel `/dashboard/metrics` — ver [MONITOREO.md](MONITOREO.md) |
| Documentación técnica y manuales de usuario | Parcial | Manual en la app (`/dashboard/manual`), este documento y `MONITOREO.md`; falta el manual de usuario en PDF |
