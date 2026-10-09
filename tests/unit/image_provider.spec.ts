import { test } from '@japa/runner'
import SvgImageProvider, { resolveImageProvider } from '#services/providers/image_provider'
import NineRouterImageProvider from '#services/providers/ninerouter_image_provider'
import ComfyUiImageProvider from '#services/providers/comfyui_image_provider'

test.group('Image providers resolution and drivers', (group) => {
  const originalFetch = globalThis.fetch

  group.each.teardown(() => {
    globalThis.fetch = originalFetch
  })

  test('resolves appropriate provider instance by providerId', ({ assert }) => {
    assert.instanceOf(resolveImageProvider('comfyui'), ComfyUiImageProvider)
    assert.instanceOf(resolveImageProvider('comfyui-local'), ComfyUiImageProvider)
    assert.instanceOf(resolveImageProvider('9router'), NineRouterImageProvider)
    assert.instanceOf(resolveImageProvider('ninerouter'), NineRouterImageProvider)
    assert.instanceOf(resolveImageProvider('openai'), NineRouterImageProvider)
    assert.instanceOf(resolveImageProvider('svg-local'), SvgImageProvider)
    assert.instanceOf(resolveImageProvider(undefined), SvgImageProvider)
  })

  test('NineRouterImageProvider successfully handles b64_json response', async ({ assert }) => {
    const fakeBase64 = Buffer.from('fake-png-binary-data').toString('base64')
    let capturedUrl = ''
    let capturedAuth = ''
    let capturedBody: any = null

    globalThis.fetch = (async (input: any, init?: any) => {
      capturedUrl = input.toString()
      capturedAuth = (init?.headers as Record<string, string>)?.Authorization ?? ''
      capturedBody = JSON.parse(init?.body as string)

      return new Response(
        JSON.stringify({
          data: [{ b64_json: fakeBase64 }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    }) as typeof fetch

    const provider = new NineRouterImageProvider({
      baseUrl: 'http://mock-9router:20128/v1',
      apiKey: 'test-key-123',
    })

    const result = await provider.generate(
      { prompt: 'a beautiful sunset', width: 1024, height: 1024 },
      {
        schemaVersion: 1,
        providerId: '9router',
        capability: 'image',
        model: 'flux-schnell',
        config: {},
        flags: {},
        costMinorPerUnit: 0,
      }
    )

    assert.equal(capturedUrl, 'http://mock-9router:20128/v1/images/generations')
    assert.equal(capturedAuth, 'Bearer test-key-123')
    assert.equal(capturedBody.prompt, 'a beautiful sunset')
    assert.equal(capturedBody.model, 'flux-schnell')
    assert.equal(result.mimeType, 'image/png')
    assert.equal(Buffer.from(result.body).toString('utf-8'), 'fake-png-binary-data')
  })

  test('ComfyUiImageProvider successfully executes prompt and fetches image', async ({
    assert,
  }) => {
    const mockWorkflow = {
      '1': {
        class_type: 'CLIPTextEncode',
        inputs: { text: 'placeholder' },
      },
      '2': {
        class_type: 'SaveImage',
        inputs: { filename_prefix: 'ComfyUI' },
      },
    }

    const promptId = 'test-prompt-uuid'
    const fakeImageBuffer = Buffer.from('mock-comfyui-image')

    globalThis.fetch = (async (input: any, init?: any) => {
      const url = input.toString()

      if (url.endsWith('/prompt') && init?.method === 'POST') {
        const body = JSON.parse(init.body as string)
        assert.equal(body.prompt['1'].inputs.text, 'a cute cat in watercolor')
        return new Response(JSON.stringify({ prompt_id: promptId }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      if (url.includes(`/history/${promptId}`)) {
        return new Response(
          JSON.stringify({
            [promptId]: {
              status: { completed: true },
              outputs: {
                '2': {
                  images: [{ filename: 'cat_001.png', subfolder: '', type: 'output' }],
                },
              },
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      }

      if (url.includes('/view?filename=cat_001.png')) {
        return new Response(fakeImageBuffer, {
          status: 200,
          headers: { 'Content-Type': 'image/png' },
        })
      }

      return new Response('Not Found', { status: 404 })
    }) as typeof fetch

    const provider = new ComfyUiImageProvider({
      baseUrl: 'http://127.0.0.1:8188',
    })

    const result = await provider.generate(
      { prompt: 'a cute cat in watercolor', width: 512, height: 512 },
      {
        schemaVersion: 1,
        providerId: 'comfyui',
        capability: 'image',
        model: 'qwen-image-2.1',
        config: {
          workflow: mockWorkflow,
          timeoutMs: 10_000,
        },
        flags: {},
        costMinorPerUnit: 0,
      }
    )

    assert.equal(result.mimeType, 'image/png')
    assert.equal(Buffer.from(result.body).toString('utf-8'), 'mock-comfyui-image')
    assert.equal(result.metadata.promptId, promptId)
    assert.equal(result.metadata.filename, 'cat_001.png')
  })
})
