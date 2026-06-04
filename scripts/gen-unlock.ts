/**
 * Generates the `unlock:` block for an exercise from a plaintext code.
 * Run: npm run unlock:gen -- "MEIN-CODE"
 *
 * Only the salted SHA-256 hash is printed — paste it into exercise.yaml. Keep the plaintext code
 * yourself (you announce it in the workshop); it is intentionally NOT stored in the repo.
 */
import { makeUnlock } from '../src/infrastructure/exercise/unlockCode';

const code = process.argv.slice(2).join(' ').trim();
if (!code) {
  console.error('Verwendung: npm run unlock:gen -- "MEIN-CODE"');
  process.exit(1);
}

const { salt, hash } = makeUnlock(code);
console.log('# In die exercise.yaml einfügen (Code NICHT committen – nur ansagen):');
console.log('unlock:');
console.log(`  salt: "${salt}"`);
console.log(`  hash: "${hash}"`);