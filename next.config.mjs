/** @type {import('next').NextConfig} */
export default {
  eslint: { ignoreDuringBuilds: true },
  serverExternalPackages: ['pdf-parse'],
  async headers() {
    return [{ source: '/widget.js', headers: [{ key: 'Cache-Control', value: 'public, max-age=300' }, { key: 'Access-Control-Allow-Origin', value: '*' }] }];
  },
};
