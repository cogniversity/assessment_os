#!/bin/sh
set -e

if [ -n "$CONTEXT_ROOT" ]; then
  export CONTEXT_ROOT
  envsubst '${CONTEXT_ROOT}' < /etc/nginx/templates/context-root.conf.template > /etc/nginx/conf.d/default.conf
else
  cp /etc/nginx/templates/root.conf /etc/nginx/conf.d/default.conf
fi

exec nginx -g 'daemon off;'
