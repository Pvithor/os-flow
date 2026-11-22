const RESTRICTED_PREFIXES = [
  '/env',
  '/server',
  '/data',
  '/src',
  '/worker',
  '/supabase',
  '/wp-admin',
  '/wp-content',
  '/wp-includes',
  '/wp-json',
  '/wp-config',
  '/wordpress',
  '/phpmyadmin',
  '/pma',
  '/mysql',
  '/adminer',
  '/dbadmin',
  '/admin',
  '/administrator',
  '/cpanel',
  '/webmail',
  '/dashboard',
  '/manager',
  '/console',
  '/actuator',
  '/graphql',
  '/graphiql',
  '/swagger',
  '/swagger-ui',
  '/api-docs',
  '/v2/api-docs',
  '/server-status',
  '/_profiler',
  '/telescope',
  '/debug',
  '/vendor',
  '/cgi-bin',
  '/boaform',
  '/solr',
  '/latest/meta-data',
  '/old',
  '/dockerfile',
  '/docker-compose'
];

const SENSITIVE_EXACT_SUFFIXES = [
  '/wp-login.php',
  '/xmlrpc.php',
  '/wp-config.php',
  '/adminer.php',
  '/phpinfo.php',
  '/info.php',
  '/test.php',
  '/swagger-ui.html',
  '/package.json',
  '/package-lock.json',
  '/composer.json',
  '/composer.lock',
  '/config.json',
  '/appsettings.json'
];

const DANGEROUS_EXT_REGEX =
  /\.(php\d*|phtml|asp|aspx|jsp|cgi|pl|py|rb|sh|sql|sqlite\d*|db|bak|backup|old|save|dist|orig|swp|tmp|zip|tar|gz|tgz|rar|7z|ya?ml|toml|ini|conf|log|key|pem|crt|env)(\b|$)/i;

function normalizePath(rawPath) {
  let decoded = String(rawPath || '');
  try {
    decoded = decodeURIComponent(decoded);
  } catch {
    decoded = String(rawPath || '');
  }
  return decoded.replace(/\\/g, '/').replace(/\/+/g, '/').toLowerCase();
}

export function matchBotProbe(rawPath) {
  const p = normalizePath(rawPath);

  if (/(^|\/)\./.test(p) || p.includes('..')) {
    return { blocked: true, reason: 'Arquivo oculto ou travessia de diretório bloqueada (404)' };
  }

  for (const prefix of RESTRICTED_PREFIXES) {
    if (p === prefix || p.startsWith(`${prefix}/`)) {
      return { blocked: true, reason: `Rota restrita/scanner bloqueada (${prefix})` };
    }
  }

  for (const suffix of SENSITIVE_EXACT_SUFFIXES) {
    if (p === suffix || p.endsWith(suffix)) {
      return { blocked: true, reason: `Arquivo sensível de scanner bloqueado (${suffix})` };
    }
  }

  if (DANGEROUS_EXT_REGEX.test(p)) {
    return { blocked: true, reason: 'Extensão de risco bloqueada (404)' };
  }

  return { blocked: false, reason: '' };
}

export function isAllowedFrontendPath(rawPath) {
  const clean = normalizePath(rawPath);
  return clean === '/' || clean === '/index.html';
}
