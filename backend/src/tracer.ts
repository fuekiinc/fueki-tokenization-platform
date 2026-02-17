import tracer from 'dd-trace';
tracer.init({
  service: 'fueki-backend',
  env: process.env.NODE_ENV || 'development',
  version: '1.0.0',
  logInjection: true,
});
export default tracer;
