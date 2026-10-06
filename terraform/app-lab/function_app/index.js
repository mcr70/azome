const { app } = require('@azure/functions');

app.http('azomeTestFunc', {
    methods: ['GET', 'POST'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        context.log('HTTP trigger function processed a request.');
        const name = request.query.get('name') || 'Azome User';

        return {
            body: JSON.stringify({
                message: "Hello " + name + "! Azome function deployed via Terraform is working.",
                timestamp: new Date().toISOString()
            }),
            headers: {
                'Content-Type': 'application/json'
            }
        };
    }
});
