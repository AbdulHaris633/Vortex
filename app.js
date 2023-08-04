const express = require("express");
const app = express();
const mysql = require("mysql");
const path = require('path'); 
const session = require("express-session"); 
const Excel = require('exceljs'); 
const bodyParser = require('body-parser');
// server-side code
const hbs = require('hbs'); // Ensure that you have required 'hbs' module

app.use(bodyParser.urlencoded({ extended: true }));

// database connection
const db = mysql.createConnection({             
  host: 'localhost',
  user: 'haris', 
  password: 'harisharis',    
  database: 'topgun' 
}); 

const publicDirectory = path.join(__dirname, './public');   
app.use(express.static(publicDirectory));
app.set('view engine', 'hbs');
  
// Connect to the database 
db.connect((error) => {
  if (error) {
    console.error('Error connecting to the database:', error);
    return;
  }
  console.log('Connected to the database');
});


app.use(express.urlencoded({ extended: false }));
app.use(session({
  secret: 'your-secret-key',
  resave: false,
  saveUninitialized: true
  
})); 

//-------------routes---------------------
app.get('/', (req, res) => {
  res.render('index');
});

app.get('/login', (req, res) => {
  res.render('login');
});




// display distinct BD names on stats24 page
app.get('/stats24', async (req, res) => {
  if (!req.session.username) {
    return res.status(401).send('Unauthorized');
  }

  const username = req.session.username;
  if (username === 'Admin') {
    try {
      const statsData = await getAllStats24Data();
      console.log('statsData:', statsData); // Add this line for debugging
      res.render('stats24', { statsData: statsData });
    } catch (err) {
      console.error('Error fetching statistics:', err);
      res.status(500).send('Error fetching statistics');
    }
  } else {
    res.send('Unauthorized');
  }
});   
 




// display distinct BD names on stats9 page
app.get('/stats9', async (req, res) => {
  if (!req.session.username) {
    return res.status(401).send('Unauthorized');
  }

  const username = req.session.username; 
  if (username === 'Admin') {
    try {
      const statsData = await getAllStatsData();
      console.log('statsData:', statsData); // Add this line for debugging
      res.render('stats9', { statsData: statsData });
    } catch (err) {
      console.error('Error fetching statistics:', err);
      res.status(500).send('Error fetching statistics');
    }
  } else {
    res.send('Unauthorized');
  }
}); 



hbs.registerHelper('joinPortalNames', function(portalNames) {
  return portalNames.split(', ').join(', '); // Split and join the portal names to display correctly
}); 
  


// display data on dashboard from job_application

app.get('/dashboard', async (req, res) => {
  // Check if the user is logged in
  if (!req.session.username) {
    return res.status(401).send('Unauthorized');
  } 

  const username = req.session.username; 
  const searchBDName = req.query.bdName;
  const searchProfile = req.query.profile;
  const searchTechStack = req.query.techStack;

  console.log(searchBDName);
  console.log(searchProfile);
  console.log(searchTechStack);
  
  // Fetch the job applications for the logged-in user from the past 24 hours  
  let query;
  let queryParams = [];
  
  if (username === 'Admin') {
    query = 'SELECT * FROM job_application WHERE 1=1'; // Fetch all job applications
    if (searchBDName) {
      query += ' AND BD LIKE ?'; // Add the WHERE clause for searching by BD   
      queryParams.push(`%${searchBDName}%`);
    }
    if (searchProfile) {
      query += ' AND Profile LIKE ?'; // Add the WHERE clause for searching by Profile   
      queryParams.push(`%${searchProfile}%`);
    }
    if (searchTechStack) {
      query += ' AND Tech_Stack LIKE ?'; // Add the WHERE clause for searching by Tech Stack   
      queryParams.push(`%${searchTechStack}%`);
    }
  } else {
    query =
      'SELECT * FROM job_application WHERE BD = ? AND Applied_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)'; // Fetch job applications for the user
    queryParams.push(username);
  }

  db.query(query, queryParams, async (err, results) => {
    if (err) {
      console.error('Error executing query:', err);
      return res.status(500).send('Error fetching job applications');
    }

    // Filter out the job applications based on the 'Processed' status
    const unprocessedApplications = results.filter((application) => application.Processed === 0);
    const processedApplications = results.filter((application) => application.Processed === 1);

    // Save only unprocessed job applications in the stats table
    if (unprocessedApplications.length > 0) {
      try {
        await saveJobApplicationsToStats(unprocessedApplications);

        // Mark the fetched job applications as processed in the "job_application" table
        const jobApplicationIds = unprocessedApplications.map((application) => application.id);
        markJobApplicationsAsProcessed(jobApplicationIds);
      } catch (saveErr) {
        console.error('Error saving job applications to stats:', saveErr);
        return res.status(500).send('Error saving job applications to stats');
      }
    }

    // Render the dashboard page with both unprocessed and processed job applications data
    res.render('dashboard', { jobApplications: results });
  });
});

  
 
// Function to mark job applications as processed in the "job_application" table
// Function to mark job applications as processed in the "job_application" table
function markJobApplicationsAsProcessed(ids) {
  const query = 'UPDATE job_application SET Processed = 1 WHERE id IN (?)';
  db.query(query, [ids], (err, result) => {  
    if (err) {
      console.error('Error marking job applications as processed:', err);
    } else {
      console.log('Job applications marked as processed in the "job_application" table.');
    }
  });
}  

 
 
  

 
 
app.get('/jobapply', (req, res) => {
  if (!req.session.username) {
    return res.status(401).send('Unauthorized');
  }
  res.render('jobapply'); 
});
app.get('/adduser', (req, res) => {
  if (req.session.username !== 'Admin') { 
    return res.status(401).send('Unauthorized');
  }

  res.render('adduser');   
});
app.get('/delete', (req, res) => {
  if (req.session.username !== 'Admin') { 
    return res.status(401).send('Unauthorized');
  }
  res.render('delete');   
});  




// verify login function
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  const query = 'SELECT * FROM users WHERE username = ? AND password = ?';
  const values = [username, password];

  db.query(query, values, (err, results) => { 
    if (err) {
      console.error('Error executing query:', err); 
      res.status(500).send('Error verifying credentials'); 
    } else {
      if (results.length > 0) {
        req.session.username = username;
        // Credentials are valid, render the dashboard page
        res.redirect('/dashboard'); 
      } else {
        // Credentials are invalid, display an error message or redirect to the login page
        res.status(401).send('Invalid credentials');
      }
    } 
  });     
}); 




// save data from jobapply to database table job_application
app.post('/jobapply', (req, res) => { 
  if (!req.session.username) {
    return res.status(401).send('Unauthorized');
  } 
 
  const { company_name, company_type, Job_source, Job_type, Job_URL, Tech_Stack, Profile, Job_title } = req.body;
  const BD = req.session.username;
  const Applied_at = new Date().toISOString().slice(0, 19).replace("T", " ");

  const query =
    'INSERT INTO job_application (company_name, company_type, Job_source, Job_type, Job_URL, BD, Applied_at, Tech_Stack, Profile, Job_title) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
  const values = [company_name, company_type, Job_source, Job_type, Job_URL, BD, Applied_at, Tech_Stack, Profile, Job_title];

  db.query(query, values, async (err, results) => {  
    if (err) {
      console.error('Error executing query:', err);
      res.status(500).send('Error storing job application');
    } else { 
      // Redirect to the /save-job-application route with a POST request
      res.redirect(307, '/save-job-application');
    }  
  });  
}); 



 
app.post('/save-job-application', async (req, res) => {
  // Check if the user is logged in
  if (!req.session.username) {
    return res.status(401).send('Unauthorized');
  }

  const jobApplicationData = req.body;

  try {
    // Save job applications in the stats table
    await saveJobApplicationsToStats([jobApplicationData]);

    // Redirect back to the dashboard page
      res.redirect('/dashboard');
    } catch (err) {
      console.error('Error saving job application to stats:', err);
      res.status(500).send('Error saving job application to stats');
    }
});





 
// Function to save job applications table data in the stats table
async function saveJobApplicationsToStats(statsData) {
  try {
    const insertQuery = 'INSERT INTO stats (BDName, TotalApplies, Portals_no, Portal_name, Time) VALUES (?, ?, ?, ?, ?)';
    const updateQuery = 'UPDATE stats SET TotalApplies = ?, Portals_no = ?, Portal_name = ?, Time = ? WHERE BDName = ?';
    const selectQuery = 'SELECT * FROM stats WHERE BDName = ?';
    const insertPromises = [];

    for (const application of statsData) {
      const bdName = application.BD;
      const totalApplies = 1;
      const portalName = application.Job_source; // Assuming that Job_source contains the portal name

      // Check if the job application for the BDName already exists in the stats table
      const selectResult = await db.query(selectQuery, [bdName]);
      const isRecordExists = selectResult.length > 0;

      if (isRecordExists) {
        // If the record exists, update the existing record instead of creating a new one
        const updatedPortals = new Set([...selectResult[0].Portal_names.split(', '), portalName]); // Combine existing and new portal names
        await db.query(updateQuery, [totalApplies, updatedPortals.size, [...updatedPortals].join(', '), application.Applied_at, bdName]);
        console.log(`Job application for BDName ${bdName} updated in the stats table.`);
      } else {
        // If the record doesn't exist, insert a new record
        const insertPromise = db.query(insertQuery, [bdName, totalApplies, 1, portalName, application.Applied_at]); // Since it's a new record, Portals_no will be 1
        insertPromises.push(insertPromise);
      }
    } 

    if (insertPromises.length > 0) {
      await Promise.all(insertPromises);
      console.log('Job applications saved in the stats table');
    } else {
      console.log('No new job applications to save in the stats table');
    }
  } catch (err) {
    console.error('Error executing query:', err);
  }
} 






app.post('/export-to-excel', async (req, res) => {
  // Check if the user is logged in
  if (!req.session.username) {
    return res.status(401).send('Unauthorized');
  }

  // Fetch data from the database
  const username = req.session.username;
  const query = 'SELECT * FROM job_application WHERE BD = ?';
  const queryParams = [username]; 

  try {
    db.query(query, queryParams, async (err, results) => {
      if (err) {
        console.error('Error executing query:', err);
        return res.status(500).send('Error fetching job applications');
      }

      // Create a new Excel workbook and worksheet
      const workbook = new Excel.Workbook();
      const worksheet = workbook.addWorksheet('Job Applications'); 

      // Add column headers
      worksheet.columns = [
        { header: 'Company Name', key: 'company_name', width: 25 },
        { header: 'Company Type', key: 'company_type', width: 15 },
        { header: 'Job Source', key: 'Job_source', width: 20 },
        { header: 'Job Type', key: 'Job_type', width: 15 },
        { header: 'Job URL', key: 'Job_URL', width: 40 },
        { header: 'BD', key: 'BD', width: 15 },
        { header: 'Applied At', key: 'Applied_at', width: 20 }, 
        { header: 'Job Title', key: 'Job_title', width: 40 },
        { header: 'Tech Stack', key: 'Tech_Stack', width: 15 },
        { header: 'Profile', key: 'Profile', width: 20 }, 
      ];

      // Add data to the worksheet
      for (const application of results) { 
        worksheet.addRow({
          company_name: application.company_name,
          company_type: application.company_type, 
          Job_source: application.Job_source,
          Job_type: application.Job_type,
          Job_URL: application.Job_URL, 
          BD: application.BD,
          Applied_at: application.Applied_at,
          Job_title: application.Job_title,
          Tech_Stack: application.Tech_Stack,
          Profile: application.Profile,

        });
      }

      // Set the response headers for downloading the Excel file
      const fileName = 'job_applications.xlsx';
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=${fileName}`);

      // Send the Excel file as the response
      await workbook.xlsx.write(res);

      // End the response
      res.end();
    });
  } catch (err) {
    console.error('Error fetching data:', err);
    res.status(500).send('Error fetching job applications');
  }
}); 




   
// Function to fetch all data from the stats table and group by BDName, and sum up values
async function getAllStatsData() {
  try { 
    const startTime = new Date();
    startTime.setHours(10, 0, 0, 0); // Set start time to 3:00 PM
    const endTime = new Date();
    endTime.setHours(16, 0, 0, 0); // Set end time to 9:00 PM

    const query = `
      SELECT
        BDName,
        SUM(TotalApplies) AS TotalApplies,
        SUM(Portals_no) AS Portals_no,
        GROUP_CONCAT(DISTINCT Portal_name) AS Portal_name
      FROM stats
      WHERE Time >= ? AND Time <= ?
      GROUP BY BDName
    `; 
    const statsData = await new Promise((resolve, reject) => {
      db.query(query, [startTime, endTime], (err, results) => {
        if (err) {
          console.error('Error executing query:', err);
          reject(err);
        } else {
          resolve(results);
        }
      });
    });  

    // Ensure that statsData is an array
    const dataArray = Array.isArray(statsData) ? statsData : [];

    // Display the data on the page
    console.log('Data for /stats9 page:');
    console.table(dataArray);

    // Return the data if needed for rendering on the page.
    return dataArray;
  } catch (err) {
    console.error('Error fetching data:', err);
    return [];
  }
} 




async function getAllStats24Data() {

  try {
    const currentTime = new Date();
    const endTime = new Date(currentTime); // Set end time to the current time

    // If the current time is after 4 AM, set the end time to 4 AM today
    if (currentTime.getHours() >= 2) {
      endTime.setHours(23, 0, 0, 0);
    } else { 
      // Otherwise, set the end time to 4 AM yesterday
      endTime.setDate(endTime.getDate() - 1);
      endTime.setHours(23, 0, 0, 0);
    }  

    // Set the start time to 3 PM yesterday
    const startTime = new Date(endTime);    
    startTime.setHours(10, 0, 0, 0);

    const query = `
      SELECT
        BDName,
        SUM(TotalApplies) AS TotalApplies,
        SUM(Portals_no) AS Portals_no,
        GROUP_CONCAT(DISTINCT Portal_name) AS Portal_name 
      FROM stats
      WHERE Time >= ? AND Time <= ? 
      GROUP BY BDName  
    `; 

    const statsData = await new Promise((resolve, reject) => {
      db.query(query, [startTime, endTime], (err, results) => {
        if (err) {
          console.error('Error executing query:', err);
          reject(err);
        } else {
          resolve(results);
        }
      }); 
    });         

    // Ensure that statsData is an array
    const dataArray = Array.isArray(statsData) ? statsData : [];

    // Display the data on the page
    console.log('Data for /stats24 page:');
    console.table(dataArray);

    // Return the data if needed for rendering on the page.
    return dataArray;
  } catch (err) {
    console.error('Error fetching data:', err);
    return [];
  }
}  



app.post('/adduser', (req, res) => {
  if (!req.session.username) {
    return res.status(401).send('Unauthorized');
  }
  const username = req.body.username;
  const password = req.body.password;
  console.log(username, password);
  const values = [username, password];

  // Insert the username and password into the users table
  const query = 'INSERT INTO users (username, password) VALUES (?, ?)';
  db.query(query, values, (err, results) => {
    if (err) {
      console.error('Error inserting data into users table: ', err);
      res.status(500).send('Error inserting data into the database.');
    } else {
      console.log('User data inserted successfully.');
      // Redirect to /dashboard after successful insertion
      res.redirect('/dashboard');
    }
  }); 
});   




app.post('/delete', (req, res) => {
  if (!req.session.username) { 
    return res.status(401).send('Unauthorized');
  }
  const username = req.body.username; 
  const password = req.body.password;

  // Query to delete the user from the users table
  const query = 'DELETE FROM users WHERE username = ? AND password = ?';
  db.query(query, [username, password], (err, results) => {
    if (username === 'Admin'){
      if (err) {
        console.error('Error deleting user from users table: ', err);
        res.status(500).send('Error deleting user from the database.');
      } else {
        if (results.affectedRows === 0) {
          // If no rows were affected, it means the user doesn't exist or the credentials are incorrect.
          res.status(404).send('User not found or incorrect credentials.');
        } else {
          console.log('User deleted successfully.');
          // Redirect to /dashboard or any other appropriate page after successful deletion
          res.redirect('/dashboard');
        }
      }
    } else{
      res.send('Unauthorized');
    }
      
  });
});  



  
// server 
app.listen(5002, () => {
  console.log("Server started on port 5002");
});                    