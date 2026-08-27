const fs = require('fs');
const acorn = require('acorn');
const jsx = require('acorn-jsx');
const parser = acorn.Parser.extend(jsx());
const code = fs.readFileSync('XinWuChanAdmin/js/cyx_bookingHandler.js', 'utf8');
const ast = parser.parse(code, {ecmaVersion: 2020});

// Node 17 is validateGlobalCapacity
const validateFn = ast.body[0].expression.callee.body.body[7].declarations[0].init.callee.body.body[17];

// Let's print the AST nodes inside validateGlobalCapacity up to line 1061
const innerNodes = validateFn.body.body;
innerNodes.forEach(child => {
   const startLine = code.substring(0, child.start).split('\n').length;
   const endLine = code.substring(0, child.end).split('\n').length;
   if (startLine < 1065) {
       console.log('Line', startLine, 'to', endLine, ':', child.type);
   }
});
