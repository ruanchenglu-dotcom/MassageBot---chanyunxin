const fs = require('fs');
const acorn = require('acorn');
const jsx = require('acorn-jsx');
const parser = acorn.Parser.extend(jsx());
const code = fs.readFileSync('XinWuChanAdmin/js/cyx_bookingHandler.js', 'utf8');

const ast = parser.parse(code, {ecmaVersion: 2020});
const node17 = ast.body[0].expression.callee.body.body[7].declarations[0].init.callee.body.body[17];
console.log('Node 17 type:', node17.type);
console.log('Node 17 starts at line:', code.substring(0, node17.start).split('\n').length);
console.log('Node 17 ends at line:', code.substring(0, node17.end).split('\n').length);
if (node17.id) console.log('Node 17 name:', node17.id.name);

let targetBody = node17.body.body;
targetBody.forEach((child, i) => {
   if (child.type === 'FunctionDeclaration') {
       console.log('Inner function:', child.id.name, 'starts at', code.substring(0, child.start).split('\n').length, 'ends at', code.substring(0, child.end).split('\n').length);
   }
   if (child.type === 'ClassDeclaration') {
       console.log('Inner class:', child.id.name, 'starts at', code.substring(0, child.start).split('\n').length, 'ends at', code.substring(0, child.end).split('\n').length);
   }
});
