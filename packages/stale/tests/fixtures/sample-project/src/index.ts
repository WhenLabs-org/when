import fastify from 'fastify';

const app = fastify();

app.get('/api/users/:id', async (request, reply) => {
  return { data: { user: {} } };
});

app.post('/api/users', async (request, reply) => {
  return { data: { user: {} } };
});

app.listen({ port: 3000 });
