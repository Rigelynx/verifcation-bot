const assert = require('assert');
const path = require('path');
const fs = require('fs');

// Cargar la base de datos
const { initEconomyTables } = require('./src/database/economyDb');
const economyDb = require('./src/database/economyDb');

console.log('====================================================');
console.log('🧪 INICIANDO TEST AUTOMATIZADO DE ECONOMÍA Y EVENTOS');
console.log('====================================================');

// 1. Inicializar tablas
initEconomyTables();
console.log('✅ Tablas inicializadas correctamente');

// 2. Pruebas de Cuentas Financieras
const ts = Date.now();
const testUser = 'TEST_USER_' + ts;
const testUser2 = 'TEST_USER2_' + ts;

let acc = economyDb.getAccount(testUser);
assert.strictEqual(acc.wallet, 100, 'Saldo inicial debe ser 100');
console.log('✅ getAccount() - Saldo inicial verificado');

economyDb.addWallet(testUser, 500, 'TEST', 'Bono de prueba');
acc = economyDb.getAccount(testUser);
assert.strictEqual(acc.wallet, 600, 'Saldo debe ser 600 tras sumar 500');
console.log('✅ addWallet() - Fondos acreditados');

const depRes = economyDb.deposit(testUser, 400);
assert.strictEqual(depRes.success, true, 'Depósito debe ser exitoso');
assert.strictEqual(depRes.deposited, 400, 'Monto depositado debe ser 400');
assert.strictEqual(depRes.account.wallet, 200, 'Cartera debe tener 200');
assert.strictEqual(depRes.account.bank, 400, 'Banco debe tener 400');
console.log('✅ deposit() - Fondos resguardados en banco');

const withRes = economyDb.withdraw(testUser, 100);
assert.strictEqual(withRes.success, true, 'Retiro debe ser exitoso');
assert.strictEqual(withRes.withdrawn, 100, 'Monto retirado debe ser 100');
assert.strictEqual(withRes.account.wallet, 300, 'Cartera debe tener 300');
assert.strictEqual(withRes.account.bank, 300, 'Banco debe tener 300');
console.log('✅ withdraw() - Fondos retirados a cartera');

const payRes = economyDb.transfer(testUser, testUser2, 50);
assert.strictEqual(payRes.success, true, 'Transferencia debe ser exitosa');
const acc2 = economyDb.getAccount(testUser2);
assert.strictEqual(acc2.wallet, 150, 'Usuario 2 debe tener 150 (100 inicial + 50 recibido)');
console.log('✅ transfer() - Transferencia entre miembros verificada');

// 3. Pruebas de Tienda estilo UnbelievaBoat (Roles to Give, Roles to Remove, Required Roles)
const shopItem = economyDb.createShopItem({
    guild_id: 'GLOBAL',
    name: 'Rango Sargento de Primera',
    description: 'Ascenso militar',
    price: 200,
    roles_to_give: ['ROLE_SARGENTO_ID'],
    roles_to_remove: ['ROLE_CABO_ID'],
    required_roles: ['ROLE_CABO_ID'],
    stock: 5,
    max_per_user: 1
});
assert(shopItem.id, 'Ítem de tienda debe tener ID');
console.log(`✅ createShopItem() - Ítem creado: ${shopItem.name} (#${shopItem.id})`);

// Intento de compra sin el rol requerido (debe fallar)
let buyFail = economyDb.purchaseShopItem(testUser, shopItem.id, ['OTRO_ROL']);
assert.strictEqual(buyFail.success, false, 'Compra debe fallar por falta de rol requerido');
console.log('✅ purchaseShopItem() - Bloqueo por falta de Required Role verificado');

// Compra con el rol requerido (debe tener éxito)
let buySuccess = economyDb.purchaseShopItem(testUser, shopItem.id, ['ROLE_CABO_ID']);
assert.strictEqual(buySuccess.success, true, 'Compra debe ser exitosa');
assert.deepStrictEqual(buySuccess.rolesToGive, ['ROLE_SARGENTO_ID'], 'Debe ordenar dar ROLE_SARGENTO_ID');
assert.deepStrictEqual(buySuccess.rolesToRemove, ['ROLE_CABO_ID'], 'Debe ordenar remover ROLE_CABO_ID');
console.log('✅ purchaseShopItem() - Compra exitosa con roles to give y roles to remove');

// Intento de segunda compra con límite max_per_user = 1 (debe fallar)
let buyLimit = economyDb.purchaseShopItem(testUser, shopItem.id, ['ROLE_CABO_ID']);
assert.strictEqual(buyLimit.success, false, 'Debe bloquear compra por exceder límite por usuario');
console.log('✅ purchaseShopItem() - Límite por usuario respetado');

// 4. Pruebas de Roles y Multiplicadores
const rewardId = economyDb.setRoleReward('GLOBAL', {
    role_id: 'ROLE_OFICIAL_ID',
    role_name: 'Capitán de Navío',
    multiplier: 1.5,
    flat_bonus: 200
});
const bestReward = economyDb.getBestRoleRewardForUser('GLOBAL', ['ROLE_OFICIAL_ID']);
assert.strictEqual(bestReward.multiplier, 1.5, 'Multiplicador debe ser 1.5');
assert.strictEqual(bestReward.flat_bonus, 200, 'Bono plano debe ser 200');
console.log('✅ setRoleReward() y getBestRoleRewardForUser() - Multiplicadores calculados correctamente');

// 5. Pruebas de Eventos y Asistencia
const eventRes = economyDb.createEvent({
    guild_id: 'GLOBAL',
    name: 'Operación Tormenta del Desierto',
    event_type: 'VOICE',
    target_channel_id: 'VOICE_CHANNEL_123',
    payout_channel_id: 'TEXT_CHANNEL_456',
    base_reward: 1000,
    claim_deadline_hours: 24,
    grace_period_minutes: 5,
    min_attendance_percent: 80
});
assert.strictEqual(eventRes.success, true, 'Evento creado');
const eventId = eventRes.event.id;

// Simular presencia del usuario en el canal de voz
economyDb.recordAttendanceHeartbeat(eventId, testUser, 'SoldadoTest', 300);

// Finalizar evento
const endedEvent = economyDb.finalizeEvent(eventId, 'MSG_12345');
assert.strictEqual(endedEvent.status, 'ENDED', 'Evento debe figurar como ENDED');
console.log('✅ finalizeEvent() - Evento concluido y elegibilidad computada');

// Reclamar pago con rol de Oficial (Base $1000 * 1.5 + $200 = $1700)
const claimRes = economyDb.claimEventPayout(eventId, testUser, ['ROLE_OFICIAL_ID']);
assert.strictEqual(claimRes.success, true, 'Reclamo debe ser exitoso');
assert.strictEqual(claimRes.amount, 1700, 'Monto reclamado debe ser $1700 con el bono de oficial');
console.log(`✅ claimEventPayout() - Reclamo exitoso: $${claimRes.amount} acreditados`);

// Intento de segundo reclamo (debe fallar)
const claimAgain = economyDb.claimEventPayout(eventId, testUser, ['ROLE_OFICIAL_ID']);
assert.strictEqual(claimAgain.success, false, 'No puede reclamar dos veces');
console.log('✅ claimEventPayout() - Prevención de doble reclamo verificada');

console.log('\n====================================================');
console.log('🎉 ¡TODAS LAS PRUEBAS UNITARIAS PASARON CON ÉXITO!');
console.log('====================================================');
