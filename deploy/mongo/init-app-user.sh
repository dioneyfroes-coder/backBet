#!/bin/sh
# Cria ou atualiza o usuário da aplicação no MongoDB (executado no primeiro
# boot do volume pelo docker-entrypoint-initdb, e idempotente caso o usuário
# já exista — garante readWrite em backbet E backbet-test).
set -e

mongosh --quiet --eval '
  const appUser = process.env.MONGO_INITDB_APP_USERNAME;
  const appPassword = process.env.MONGO_INITDB_APP_PASSWORD;
  const appDb = process.env.MONGO_INITDB_DATABASE || "backbet";
  const testDb = "backbet-test";

  if (!appUser || !appPassword) {
    print("MONGO_INITDB_APP_USERNAME/PASSWORD nao definidos — pulando criacao do usuario da app.");
    quit();
  }

  const admin = db.getSiblingDB("admin");
  const roles = [
    { role: "readWrite", db: appDb },
    { role: "readWrite", db: testDb },
  ];

  if (admin.getUser(appUser)) {
    admin.grantRolesToUser(appUser, roles);
    print("Usuario da aplicacao atualizado: " + appUser + " (readWrite em " + appDb + " e " + testDb + ")");
    quit();
  }

  admin.createUser({ user: appUser, pwd: appPassword, roles });
  print("Usuario da aplicacao criado: " + appUser + " (readWrite em " + appDb + " e " + testDb + ")");
'
