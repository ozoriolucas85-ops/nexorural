// Ejecutar con: node tests/run-node.js
var resultados = require('./casos.js').ejecutar();
var fallidos = 0;
resultados.forEach(function (r) {
  if (!r.ok) fallidos++;
  console.log((r.ok ? '  OK   ' : '  FALLA') + '  ' + r.nombre + (r.error ? '  (' + r.error + ')' : ''));
});
console.log('\n' + (resultados.length - fallidos) + '/' + resultados.length + ' casos superados');
process.exit(fallidos ? 1 : 0);
