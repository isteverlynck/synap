# SYNAP

Sistema web de gestión de equipamiento médico para el servicio de Bioingeniería
del Hospital Alemán. Proyecto Final de Carrera de Bioingeniería, ITBA (2026).

Autoras: Camila Barbagelata · Inés Steverlynck

**Aplicación publicada:** https://synap-frontend.vercel.app

## Qué hace

SYNAP centraliza en una sola plataforma la información de los equipos médicos,
las órdenes de trabajo correctivas y preventivas, el stock de insumos y
repuestos, y los indicadores de desempeño del servicio. Se usa desde el
navegador, en computadoras y celulares, y cada equipo puede consultarse
escaneando su código QR.

Tiene cuatro perfiles de usuario, cada uno con sus propias pantallas y permisos:

- **Enfermería:** reporta fallas desde el código QR del equipo y sigue el estado
  de sus solicitudes.
- **Técnico:** atiende las órdenes asignadas, completa los checklists de
  mantenimiento preventivo y registra los repuestos utilizados.
- **Coordinación:** recibe las solicitudes, asigna órdenes y gestiona el stock y
  los planes de mantenimiento.
- **Jefatura:** consulta el panel de indicadores y el estado de las órdenes.

## Tecnologías

- **Backend:** Python + FastAPI + SQLAlchemy
- **Base de datos:** PostgreSQL, alojada en Supabase
- **Autenticación:** tokens JWT y contraseñas hasheadas con bcrypt
- **Frontend:** React + Vite, react-router-dom, axios, recharts y html5-qrcode
  (escaneo de QR desde el navegador)
- **Correos:** SMTP a través de Brevo
- **Tareas programadas:** APScheduler en desarrollo, Cron de Vercel en la
  versión publicada
- **Publicación:** Vercel

## Estructura del repositorio

    synap/
    ├── backend/            # API (FastAPI)
    │   ├── app/            # Código: modelos, rutas, permisos, tareas programadas
    │   ├── requirements.txt
    │   ├── index.py        # Punto de entrada para Vercel
    │   ├── vercel.json     # Cron diario de Vercel
    │   └── .env.example    # Plantilla de variables de entorno
    ├── synap-frontend/     # Interfaz web (React + Vite)
    └── latex/              # Fuentes del informe final

## Cómo correrlo localmente

Hace falta tener instalado **Python 3.11+** y **Node.js 18+**. El sistema tiene
dos partes que corren a la vez, cada una en su terminal.

**1. Clonar el repositorio**

```bash
git clone https://github.com/isteverlynck/synap.git
cd synap
```

**2. Backend**

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r backend/requirements.txt
cp backend/.env.example backend/.env
```

En `backend/.env` completar al menos `DATABASE_URL` (la conexión a Supabase) y
`SECRET_KEY` (se genera con
`python3 -c "import secrets; print(secrets.token_hex(32))"`). Si no se cargan
los datos de SMTP, los correos se muestran en la consola en lugar de enviarse.

```bash
cd backend
uvicorn app.main:app --reload --port 8000
```

El backend queda en `http://localhost:8000`, con la documentación de la API en
`http://localhost:8000/docs`.

**3. Frontend**, en otra terminal:

```bash
cd synap-frontend
npm install
npm run dev
```

Se abre en la dirección que indique la terminal (normalmente
`http://localhost:5173`) y necesita el backend corriendo.

## Despliegue

La aplicación está publicada en Vercel como dos proyectos independientes,
`synap-backend` y `synap-frontend`, creados a partir de este mismo repositorio.
Cada `git push` a `main` vuelve a publicar ambos automáticamente.

Las variables de entorno se cargan en la configuración de cada proyecto en
Vercel, no en el repositorio:

- **Backend:** `DATABASE_URL` (Transaction pooler de Supabase), `SECRET_KEY`,
  las de SMTP, `EMAIL_NOTIFICACIONES`, `URL_FRONTEND`, `CORS_ORIGINS`,
  `CRON_SECRET` y `DEBUG=false`.
- **Frontend:** `VITE_API_URL`, con la dirección del backend.

## Notas

- El archivo `.env` contiene datos sensibles y no se versiona. Cada persona arma
  el suyo a partir de `.env.example`.
- Las tablas ya existen en Supabase; el backend se conecta a ellas pero no las
  crea.