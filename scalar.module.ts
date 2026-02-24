import { Controller, DynamicModule, Get, Header, Module } from '@nestjs/common';
import { Spec } from './router';

export interface ScalarOptions {
  spec: Spec;
  docsPath?: string;
  specPath?: string;
  title?: string;
  scalar?: any;
}

@Module({})
export class ScalarModule {
  static forRoot(options: ScalarOptions): DynamicModule {
    const docsPath = options.docsPath ?? 'docs';
    const specPath = options.specPath ?? 'spec.json';
    const title = options.title ?? 'API Reference';
    const scalarOptions = {
      url: `/${specPath}`,
      agent: {
        disabled: true,
      },
      hideClientButton: true,
      hiddenClients: {
        c: ['libcurl'],
        clojure: ['clj_http'],
        csharp: ['httpclient', 'restsharp'],
        dart: ['http'],
        fsharp: ['httpclient'],
        go: ['native'],
        java: ['asynchttp', 'nethttp', 'okhttp', 'unirest'],
        js: ['jquery', 'ofetch', 'xhr'],
        kotlin: ['okhttp'],
        node: ['axios', 'fetch', 'ofetch', 'undici'],
        objc: ['nsurlsession'],
        ocaml: ['cohttp'],
        php: ['curl', 'guzzle'],
        powershell: ['restmethod', 'webrequest'],
        python: ['httpx_async', 'httpx_sync', 'python3', 'requests'],
        r: ['httr'],
        ruby: ['native'],
        rust: ['reqwest'],
        shell: ['wget'],
        swift: ['nsurlsession'],
      },
      ...(options.scalar || {}),
    };

    @Controller()
    class ScalarController {
      @Get(specPath)
      spec() {
        return {
          openapi: '3.2.0',
          info: { title: 'API' },
          ...options.spec,
        };
      }

      @Get(docsPath)
      @Header('Content-Type', 'text/html')
      docs() {
        return `
        <!doctype html>
        <html>
          <head>
            <title>${title}</title>
            <meta charset="utf-8" />
            <meta
              name="viewport"
              content="width=device-width, initial-scale=1" />
          </head>

          <body>
            <div id="app"></div>

            <!-- Load the Script -->
            <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>

            <!-- Initialize the Scalar API Reference -->
            <script>
              Scalar.createApiReference(
                '#app',
                ${JSON.stringify(scalarOptions)}
              )
            </script>
          </body>
        </html>`;
      }
    }

    return {
      module: ScalarModule,
      controllers: [ScalarController],
    };
  }
}
