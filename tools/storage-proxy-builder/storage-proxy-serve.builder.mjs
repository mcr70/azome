import { spawn } from 'node:child_process';
import net from 'node:net';
import { createBuilder } from '@angular-devkit/architect';
import { Observable } from 'rxjs';

function waitForPort(port, child, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const attempt = () => {
      if (child.exitCode !== null) {
        reject(new Error('The Storage proxy process exited before it started listening.'));
        return;
      }
      const socket = net.connect(port, '127.0.0.1');
      socket.once('connect', () => {
        socket.destroy();
        resolve();
      });
      socket.once('error', () => {
        socket.destroy();
        if (Date.now() - started >= timeoutMs) {
          reject(new Error('The Storage proxy did not start listening on port ' + port + '.'));
        } else {
          setTimeout(attempt, 100);
        }
      });
    };
    attempt();
  });
}

function parseTarget(specifier, defaultProject, configuration) {
  const [project = defaultProject, target = 'serve-angular', targetConfiguration = configuration] = specifier.split(':');
  return { project, target, configuration: targetConfiguration };
}

export default createBuilder((options, context) => new Observable(subscriber => {
  const proxy = spawn(process.execPath, [options.proxyScript], {
    stdio: 'inherit',
    env: { ...process.env, STORAGE_PROXY_PORT: String(options.proxyPort) }
  });
  let angularRun;
  let angularSubscription;
  let stopped = false;

  const stop = () => {
    if (stopped) return;
    stopped = true;
    angularSubscription?.unsubscribe();
    void angularRun?.stop();
    proxy.kill('SIGTERM');
  };

  proxy.once('error', error => subscriber.error(error));
  proxy.on('exit', code => {
    if (!stopped) subscriber.error(new Error('The Storage proxy exited unexpectedly with code ' + code + '.'));
  });

  const { proxyScript, proxyPort, delegateTarget, ...serveOverrides } = options;
  void waitForPort(proxyPort, proxy).then(async () => {
    if (stopped) return;
    angularRun = await context.scheduleTarget(
      parseTarget(delegateTarget, context.target.project, context.target.configuration),
      serveOverrides
    );
    angularSubscription = angularRun.output.subscribe({
      next: output => subscriber.next(output),
      error: error => subscriber.error(error),
      complete: () => subscriber.complete()
    });
  }).catch(error => subscriber.error(error));

  return stop;
}));
