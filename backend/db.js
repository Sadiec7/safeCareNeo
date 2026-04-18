const { MongoClient, ServerApiVersion } = require('mongodb');
require('dotenv').config();

const uri = process.env.MONGO_URI;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

let dbConnection;

module.exports = {
  connectToDatabase: async function () {
    try {
      if (dbConnection) return dbConnection;
      
      await client.connect();
      dbConnection = client.db("safeCareNeo"); 
      console.log("Conectado exitosamente a MongoDB Atlas");
      return dbConnection;
    } catch (e) {
      console.error("Error conectando a MongoDB:", e);
      throw e;
    }
  },
  getDb: function () {
    return dbConnection;
  }
};