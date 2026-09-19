#!/bin/sh
# Cria/atualiza os usuários do MongoDB no primeiro boot do volume
# (docker-entrypoint-initdb) e é idempotente em re-execução manual:
#   backbet      -> readWrite em ${MONGO_INITDB_DATABASE:-backbet} (aplicação)
#   backbet-test -> readWrite em "backbet-test"                      (suíte de integração)
#   backbet_drill      -> readWrite em "backbet_drill"       para "backbet"     (backup:drill)
#   backbet-test-drill -> readWrite em "backbet-test-drill" para "backbet-test" (testes de backup)
#
# Usuários SEPARADOS = isolamento: a suíte de integração usa credenciais
# próprias e NUNCA tem acesso ao banco da aplicação.
set -e

mongosh --quiet --eval '
  const appUser = process.env.MONGO_INITDB_APP_USERNAME;
  const appPassword = process.env.MONGO_INITDB_APP_PASSWORD;
  const appDb = process.env.MONGO_INITDB_DATABASE || "backbet";
  const testUser = process.env.MONGO_INITDB_TEST_USERNAME;
  const testPassword = process.env.MONGO_INITDB_TEST_PASSWORD;
  const testDb = "backbet-test";
  const appDrillDb = "backbet_drill";
  const testDrillDb = "backbet-test-drill";

  const admin = db.getSiblingDB("admin");

  const appRoles = [
    { role: "readWrite", db: appDb },
    { role: "readWrite", db: appDrillDb },
  ];
  const testRoles = [
    { role: "readWrite", db: testDb },
    { role: "readWrite", db: testDrillDb },
  ];

  const upsertUser = (username, password, roles) => {
    if (!username || !password) {
      print("Pulando usuario ausente na configuracao (MONGO_INITDB_*_USERNAME/PASSWORD).");
      return;
    }
    if (admin.getUser(username)) {
      admin.updateUser(username, { roles });
      print("Usuario atualizado: " + username + " (papeis: " + roles.map(r => r.db + ":" + r.role).join(", ") + ")");
    } else {
      admin.createUser({ user: username, pwd: password, roles });
      print("Usuario criado: " + username + " (papeis: " + roles.map(r => r.db + ":" + r.role).join(", ") + ")");
    }
  };

  upsertUser(appUser, appPassword, appRoles);
  upsertUser(testUser, testPassword, testRoles);
'