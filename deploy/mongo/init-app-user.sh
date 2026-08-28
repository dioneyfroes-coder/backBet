#!/bin/sh
# Cria o usuário da aplicação no MongoDB (executado uma única vez, no primeiro
# boot do volume, pelo docker-entrypoint-initdb do container mongo:7).
# Usuário com privilégio mínimo: readWrite apenas no banco da aplicação.
set -e

mongosh --quiet --eval '
  const appUser = process.env.MONGO_INITDB_APP_USERNAME;
  const appPassword = process.env.MONGO_INITDB_APP_PASSWORD;
  const appDb = process.env.MONGO_INITDB_DATABASE || "backbet";

  if (!appUser || !appPassword) {
    print("MONGO_INITDB_APP_USERNAME/PASSWORD nao definidos — pulando criacao do usuario da app.");
    quit();
  }

  const admin = db.getSiblingDB("admin");
  if (admin.getUser(appUser)) {
    print("Usuario da aplicacao ja existe: " + appUser);
    quit();
  }

  admin.createUser({
    user: appUser,
    pwd: appPassword,
    roles: [{ role: "readWrite", db: appDb }],
  });
  print("Usuario da aplicacao criado: " + appUser + " (db: " + appDb + ")");
'