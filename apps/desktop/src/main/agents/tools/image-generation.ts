import Replicate, { FileOutput } from 'replicate';
import type { Tool } from '../types';

export function createImageGenerationTool(getApiKey: () => Promise<string | null>): Tool<{ prompt: string }> {
  return {
    name: 'generate_image',
    description:
      'Generate an image from a text prompt using AI. Returns the generated image. Use this when the user asks you to create, generate, draw, or make an image.',
    input_schema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'A detailed text description of the image to generate',
        },
      },
      required: ['prompt'],
    },
    permission: { permission: 'always', risk_level: 'safe' },

    async execute(input) {
      console.log(`[generate_image] Generating image for prompt: "${input.prompt}"`);

      const auth = await getApiKey();

      if (!auth) {
        return 'Error: Replicate API key not configured. Set REPLICATE_API_TOKEN in apps/desktop/.env';
      }

      const replicate = new Replicate({ auth });

      const output = await replicate.run('prunaai/z-image-turbo', {
        input: {
          prompt: input.prompt,
        },
      });

      // output is a FileOutput (ReadableStream) or array of FileOutput
      const fileOutput: FileOutput = Array.isArray(output) ? output[0] : output;

      // FileOutput is a ReadableStream — collect chunks into a buffer
      const reader = fileOutput.getReader();
      const chunks: Uint8Array[] = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }
      const buffer = Buffer.concat(chunks);
      const base64 = buffer.toString('base64');

      // Infer content type from the URL or default to webp
      const url = fileOutput.url().toString();
      const ext = url.split('.').pop()?.split('?')[0]?.toLowerCase();
      const contentType =
        ext === 'png' ? 'image/png' :
        ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' :
        'image/webp';

      const dataUri = `data:${contentType};base64,${base64}`;

      console.log(`[generate_image] Image generated successfully (${buffer.length} bytes)`);

      return {
        text: `Generated image for: "${input.prompt}"`,
        images: [dataUri],
      };
    },
  };
}
