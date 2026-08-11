# SYNAP

Sistema de gestión de equipamiento médico para el servicio de Bioingeniería del
Hospital Alemán. Proyecto Final de Carrera — Ingeniería Biomédica, ITBA (2026).

Autoras: Camila Barbagelata · Inés Steverlynck

## Estado del proyecto

En desarrollo. Actualmente implementado:
- Backend (FastAPI): autenticación de usuarios con activación en el primer
  ingreso, login por número de identificación y tokens JWT.

## Tecnologías

- **Backend:** Python + FastAPI
- **Base de datos:** PostgreSQL (alojada en Supabase)
- **ORM:** SQLAlchemy
- **Autenticación:** JWT (tokens) + contraseñas hasheadas con bcrypt

## Estructura del repositorio
synap/
├── backend/
│ ├── app/
│ │ ├── main.py # Enciende el backend y conecta los routers
│ │ ├── config.py # Configuración (lee variables del .env)
│ │ ├── database.py # Conexión a la base de datos (Supabase)
│ │ ├── models.py # Tablas traducidas a Python (ORM)
│ │ ├── schemas.py # Contratos de entrada/salida de la API
│ │ ├── security.py # Hasheo de contraseñas y tokens
│ │ └── routers/
│ │ └── auth.py # Endpoints de login y activación
│ ├── .env # Variables sensibles (NO se sube a GitHub)
│ └── .env.example # Plantilla del .env
├── requirements.txt # Librerías de Python que usa el proyecto
└── README.md

## Cómo levantar el proyecto localmente

### 1. Clonar el repositorio

```bash
git clone https://github.com/isteverlynck/synap.git
cd synap
```

### 2. Crear y activar el entorno virtual

```bash
python3 -m venv venv
source venv/bin/activate
```

Al activarlo, el renglón de la terminal debería empezar con `(venv)`.
(En Windows, el comando de activación es `venv\Scripts\activate`.)

### 3. Instalar las librerías

```bash
pip install -r requirements.txt
```

### 4. Configurar las variables de entorno

Copiar la plantilla y completar los valores reales:

```bash
cp backend/.env.example backend/.env
```

Después, abrir `backend/.env` y completar:
- `DATABASE_URL`: la connection string de Supabase (pedírsela a Ine).
- `SECRET_KEY`: generar una con
  `python3 -c "import secrets; print(secrets.token_hex(32))"`.

### 5. Correr el backend

```bash
cd backend
uvicorn app.main:app --reload --port 8000
```

El backend queda corriendo en `http://localhost:8000`.
La documentación interactiva de la API está en `http://localhost:8000/docs`.

## Notas

- El archivo `.env` contiene datos sensibles y no se versiona. Cada persona
  arma el suyo a partir de `.env.example`.
- Las tablas de la base ya existen en Supabase; el backend se conecta a ellas
  (no las crea).

  