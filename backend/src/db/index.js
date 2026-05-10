import pkg from 'pg' ; 
const {Pool} = pkg ; 
import dotenv from 'dotenv' ; 

dotenv.config() ; 

//create a connection using DATABASE_URL 
const pool = new Pool({
    connectionString: process.env.POSTGRESQL_STRING , 
    ssl : {
        rejectUnauthorized: false //required for neon thing
    }
}); 

//test connection 

pool.connect((err, client , release) => {
    if(err){
        console.log('Database connevtion error : ' , err.stack); 
    }else{
        console.log('Connection to Neon POSTGRE SQL Successfully!!'); 
        release() ; 
    }
}); 

export default pool ; 