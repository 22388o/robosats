import React, { Component } from "react";
import { Chip, Tooltip, Badge, Tab, Tabs, Alert, Paper, CircularProgress, Button , Grid, Typography, List, ListItem, ListItemIcon, ListItemText, ListItemAvatar, Avatar, Divider, Box, LinearProgress, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle} from "@mui/material"
import Countdown, { zeroPad, calcTimeDelta } from 'react-countdown';
import MediaQuery from 'react-responsive'

import TradeBox from "./TradeBox";
import getFlags from './getFlags'

// icons
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import NumbersIcon from '@mui/icons-material/Numbers';
import PriceChangeIcon from '@mui/icons-material/PriceChange';
import PaymentsIcon from '@mui/icons-material/Payments';
import ArticleIcon from '@mui/icons-material/Article';

function getCookie(name) {
  let cookieValue = null;
  if (document.cookie && document.cookie !== '') {
      const cookies = document.cookie.split(';');
      for (let i = 0; i < cookies.length; i++) {
          const cookie = cookies[i].trim();
          // Does this cookie string begin with the name we want?
          if (cookie.substring(0, name.length + 1) === (name + '=')) {
              cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
              break;
          }
      }
  }
  return cookieValue;
}
const csrftoken = getCookie('csrftoken');

// pretty numbers
function pn(x) {
  var parts = x.toString().split(".");
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return parts.join(".");
}

export default class OrderPage extends Component {
  constructor(props) {
    super(props);
    this.state = {
        is_explicit: false,
        delay: 60000, // Refresh every 60 seconds by default
        currencies_dict: {"1":"USD"},
        total_secs_exp: 300,
        loading: true,
        openCancel: false,
        openCollaborativeCancel: false,
        openInactiveMaker: false,
        showContractBox: 1,
    };
    this.orderId = this.props.match.params.orderId;
    this.getCurrencyDict();
    this.getOrderDetails();

    // Refresh delays according to Order status
    this.statusToDelay = {
      "0": 2000,    //'Waiting for maker bond'
      "1": 25000,   //'Public'
      "2": 999999,  //'Deleted'
      "3": 2000,    //'Waiting for taker bond'
      "4": 999999,  //'Cancelled'
      "5": 999999,  //'Expired'
      "6": 3000,    //'Waiting for trade collateral and buyer invoice'
      "7": 3000,    //'Waiting only for seller trade collateral'
      "8": 8000,    //'Waiting only for buyer invoice'
      "9": 10000,   //'Sending fiat - In chatroom'
      "10": 10000,  //'Fiat sent - In chatroom'
      "11": 30000,  //'In dispute'
      "12": 999999, //'Collaboratively cancelled'
      "13": 3000,   //'Sending satoshis to buyer'
      "14": 999999, //'Sucessful trade'
      "15": 10000,  //'Failed lightning network routing'
      "16": 180000, //'Wait for dispute resolution'
      "17": 180000, //'Maker lost dispute'
      "18": 180000, //'Taker lost dispute'
    }
  }

  completeSetState=(newStateVars)=>{
    // In case the reply only has "bad_request"
    // Do not substitute these two for "undefined" as
    // otherStateVars will fail to assign values
    if (newStateVars.currency == null){
      newStateVars.currency = this.state.currency
      newStateVars.status = this.state.status
    }

    var otherStateVars = {
      loading: false,
      delay: this.setDelay(newStateVars.status),
      currencyCode: this.getCurrencyCode(newStateVars.currency),
      penalty: newStateVars.penalty, // in case penalty time has finished, it goes back to null
      invoice_expired: newStateVars.invoice_expired  // in case invoice had expired, it goes back to null when it is valid again
    };

    var completeStateVars = Object.assign({}, newStateVars, otherStateVars);
    this.setState(completeStateVars);
  }

  getOrderDetails() {
    this.setState(null)
    fetch('/api/order' + '?order_id=' + this.orderId)
      .then((response) => response.json())
      .then((data) => this.completeSetState(data));
  }

  // These are used to refresh the data
  componentDidMount() {
    this.interval = setInterval(this.tick, this.state.delay);
  }
  componentDidUpdate() {
    clearInterval(this.interval);
      this.interval = setInterval(this.tick, this.state.delay);
  }

  componentWillUnmount() {
    clearInterval(this.interval);
  }
  tick = () => {
    this.getOrderDetails();
  }

  // Countdown Renderer callback with condition 
  countdownRenderer = ({ total, hours, minutes, seconds, completed }) => {
  if (completed) {
    // Render a completed state
    return (<span> The order has expired</span>);

  } else {
    var col = 'black'
    var fraction_left = (total/1000) / this.state.total_secs_exp
    // Make orange at 25% of time left
    if (fraction_left < 0.25){col = 'orange'}
    // Make red at 10% of time left
    if (fraction_left < 0.1){col = 'red'}
    // Render a countdown, bold when less than 25%
    return (
      fraction_left < 0.25 ? <b><span style={{color:col}}>{hours}h {zeroPad(minutes)}m {zeroPad(seconds)}s </span></b>
      :<span style={{color:col}}>{hours}h {zeroPad(minutes)}m {zeroPad(seconds)}s </span>
    );
  }
  };

  // Countdown Renderer callback with condition 
  countdownPenaltyRenderer = ({ minutes, seconds, completed }) => {
    if (completed) {
      // Render a completed state
      return (<span> Penalty lifted, good to go!</span>);
  
    } else {
      return (
        <span> You cannot take an order yet! Wait {zeroPad(minutes)}m {zeroPad(seconds)}s </span>
      );
    }
    };
  
  countdownTakeOrderRenderer = ({ seconds, completed }) => {
    if(isNaN(seconds)){
      return (
      <>
        <this.InactiveMakerDialog/>
        <Button variant='contained' color='primary' 
            onClick={this.state.maker_status=='Inactive' ? this.handleClickOpenInactiveMakerDialog : this.takeOrder}>
            Take Order
          </Button>
      </>)
    }
    if (completed) {
      // Render a completed state
      return (
        <>
          <this.InactiveMakerDialog/>
          <Button variant='contained' color='primary' 
            onClick={this.state.maker_status=='Inactive' ? this.handleClickOpenInactiveMakerDialog : this.takeOrder}>
            Take Order
          </Button>
        </>
      );
    } else{
      return(
      <Tooltip enterTouchDelay="0" title="Wait until you can take an order"><div>
      <Button disabled={true} variant='contained' color='primary' onClick={this.takeOrder}>Take Order</Button>
      </div></Tooltip>)
    }
  };

  LinearDeterminate =()=> {
    const [progress, setProgress] = React.useState(0);
  
    React.useEffect(() => {
      const timer = setInterval(() => {
        setProgress((oldProgress) => {
          var left = calcTimeDelta( new Date(this.state.expires_at)).total /1000;
          return (left / this.state.total_secs_exp) * 100;
        });
      }, 1000);
  
      return () => {
        clearInterval(timer);
      };
    }, []);
  
    return (
      <Box sx={{ width: '100%' }}>
        <LinearProgress variant="determinate" value={progress} />
      </Box>
    );
  }

  takeOrder=()=>{
    this.setState({loading:true})

    const requestOptions = {
        method: 'POST',
        headers: {'Content-Type':'application/json', 'X-CSRFToken': getCookie('csrftoken'),},
        body: JSON.stringify({
          'action':'take',
        }),
      };
      fetch('/api/order/' + '?order_id=' + this.orderId, requestOptions)
      .then((response) => response.json())
      .then((data) => this.completeSetState(data));
  }

  getCurrencyDict() {
    fetch('/static/assets/currencies.json')
      .then((response) => response.json())
      .then((data) => 
      this.setState({
        currencies_dict: data
      }));
  }
  
  // set delay to the one matching the order status. If null order status, delay goes to 9999999.
  setDelay = (status)=>{
    return status >= 0 ? this.statusToDelay[status.toString()] : 99999999;
  }

  getCurrencyCode(val){
    let code = val ? this.state.currencies_dict[val.toString()] : "" 
    return code
  }

  handleClickConfirmCancelButton=()=>{
    this.setState({loading:true})
    const requestOptions = {
        method: 'POST',
        headers: {'Content-Type':'application/json', 'X-CSRFToken': getCookie('csrftoken'),},
        body: JSON.stringify({
          'action':'cancel',
        }),
    };
    fetch('/api/order/' + '?order_id=' + this.orderId, requestOptions)
    .then((response) => response.json())
    .then((data) => this.getOrderDetails(data.id));
    this.handleClickCloseConfirmCancelDialog();
  }

  handleClickOpenConfirmCancelDialog = () => {
    this.setState({openCancel: true});
  };
  handleClickCloseConfirmCancelDialog = () => {
      this.setState({openCancel: false});
  };

  CancelDialog =() =>{
  return(
      <Dialog
      open={this.state.openCancel}
      onClose={this.handleClickCloseConfirmCancelDialog}
      aria-labelledby="cancel-dialog-title"
      aria-describedby="cancel-dialog-description"
      >
        <DialogTitle id="cancel-dialog-title">
          {"Cancel the order?"}
        </DialogTitle>
        <DialogContent>
          <DialogContentText id="cancel-dialog-description">
            If the order is cancelled now you will lose your bond.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={this.handleClickCloseConfirmCancelDialog} autoFocus>Go back</Button>
          <Button onClick={this.handleClickConfirmCancelButton}> Confirm Cancel </Button>
        </DialogActions>
      </Dialog>
    )
  }

  handleClickOpenInactiveMakerDialog = () => {
    this.setState({openInactiveMaker: true});
  };
  handleClickCloseInactiveMakerDialog = () => {
      this.setState({openInactiveMaker: false});
  };

  InactiveMakerDialog =() =>{
  return(
      <Dialog
      open={this.state.openInactiveMaker}
      onClose={this.handleClickCloseInactiveMakerDialog}
      aria-labelledby="inactive-maker-dialog-title"
      aria-describedby="inactive-maker-description"
      >
        <DialogTitle id="inactive-maker-dialog-title">
          {"The maker is away"}
        </DialogTitle>
        <DialogContent>
          <DialogContentText id="cancel-dialog-description">
            By taking this order you risk wasting your time.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={this.handleClickCloseInactiveMakerDialog} autoFocus>Go back</Button>
          <Button onClick={this.takeOrder}> Take Order </Button>
        </DialogActions>
      </Dialog>
    )
  }
  handleClickConfirmCollaborativeCancelButton=()=>{
      const requestOptions = {
          method: 'POST',
          headers: {'Content-Type':'application/json', 'X-CSRFToken': getCookie('csrftoken'),},
          body: JSON.stringify({
            'action':'cancel',
          }),
      };
      fetch('/api/order/' + '?order_id=' + this.orderId, requestOptions)
      .then((response) => response.json())
      .then((data) => this.getOrderDetails(data.id));
    this.handleClickCloseCollaborativeCancelDialog();
  }

  handleClickOpenCollaborativeCancelDialog = () => {
    this.setState({openCollaborativeCancel: true});
  };
  handleClickCloseCollaborativeCancelDialog = () => {
      this.setState({openCollaborativeCancel: false});
  };

  CollaborativeCancelDialog =() =>{
  return(
      <Dialog
      open={this.state.openCollaborativeCancel}
      onClose={this.handleClickCloseCollaborativeCancelDialog}
      aria-labelledby="collaborative-cancel-dialog-title"
      aria-describedby="collaborative-cancel-dialog-description"
      >
        <DialogTitle id="cancel-dialog-title">
          {"Collaborative cancel the order?"}
        </DialogTitle>
        <DialogContent>
          <DialogContentText id="cancel-dialog-description">
            The trade escrow has been posted. The order can be cancelled only if both, maker and 
            taker, agree to cancel. 
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={this.handleClickCloseCollaborativeCancelDialog} autoFocus>Go back</Button>
          <Button onClick={this.handleClickConfirmCollaborativeCancelButton}> Ask for Cancel </Button>
        </DialogActions>
      </Dialog>
    )
  }

  CancelButton = () => {

    // If maker and Waiting for Bond. Or if taker and Waiting for bond.
    // Simply allow to cancel without showing the cancel dialog. 
    if ((this.state.is_maker & [0,1].includes(this.state.status)) || this.state.is_taker & this.state.status == 3){
      return(
        <Grid item xs={12} align="center">
          <Button variant='contained' color='secondary' onClick={this.handleClickConfirmCancelButton}>Cancel</Button>
        </Grid>
      )}
    // If the order does not yet have an escrow deposited. Show dialog
    // to confirm forfeiting the bond
    if ([3,6,7].includes(this.state.status)){
      return(
        <div id="openDialogCancelButton">
          <Grid item xs={12} align="center">
            <this.CancelDialog/>
            <Button variant='contained' color='secondary' onClick={this.handleClickOpenConfirmCancelDialog}>Cancel</Button>
          </Grid>
        </div>
      )}
    
    // If the escrow is Locked, show the collaborative cancel button.
  
    if ([8,9].includes(this.state.status)){
      return(
        <Grid item xs={12} align="center">
          <this.CollaborativeCancelDialog/>
          <Button variant='contained' color='secondary' onClick={this.handleClickOpenCollaborativeCancelDialog}>Collaborative Cancel</Button>
        </Grid>
      )}

    // If none of the above do not return a cancel button.
    return(null)
  }

  // Colors for the status badges
  statusBadgeColor(status){
    if(status=='Active'){return("success")}
    if(status=='Seen recently'){return("warning")}
    if(status=='Inactive'){return('error')}
  }

  orderBox=()=>{
    return(
      <Grid container spacing={1} >
        <Grid item xs={12} align="center">
          <MediaQuery minWidth={920}>
            <Typography component="h5" variant="h5">
              Order Box
            </Typography>
          </MediaQuery>
          <Paper elevation={12} style={{ padding: 8,}}>
          <List dense="true">
            <ListItem >
              <ListItemAvatar sx={{ width: 56, height: 56 }}>
              <Tooltip placement="top" enterTouchDelay="0" title={this.state.maker_status} >
                <Badge variant="dot" overlap="circular" badgeContent="" color={this.statusBadgeColor(this.state.maker_status)}>
                  <Avatar className="flippedSmallAvatar"
                    alt={this.state.maker_nick} 
                    src={window.location.origin +'/static/assets/avatars/' + this.state.maker_nick + '.png'} 
                    />
                </Badge>
              </Tooltip>
              </ListItemAvatar>
              <ListItemText primary={this.state.maker_nick + (this.state.type ? " (Seller)" : " (Buyer)")} secondary="Order maker" align="right"/>
            </ListItem>

            {this.state.is_participant ?
              <>
                {this.state.taker_nick!='None' ?
                  <>
                    <Divider />
                    <ListItem align="left">
                      <ListItemText primary={this.state.taker_nick + (this.state.type ? " (Buyer)" : " (Seller)")} secondary="Order taker"/>
                      <ListItemAvatar > 
                      <Tooltip enterTouchDelay="0" title={this.state.taker_status} >
                        <Badge variant="dot" overlap="circular" badgeContent="" color={this.statusBadgeColor(this.state.taker_status)}>
                          <Avatar className="smallAvatar"
                            alt={this.state.taker_nick} 
                            src={window.location.origin +'/static/assets/avatars/' + this.state.taker_nick + '.png'}
                            />
                        </Badge>
                        </Tooltip>
                      </ListItemAvatar>
                    </ListItem>           
                  </>: 
                  ""
                  }
                  <Divider><Chip label='Order Details'/></Divider>
                  <ListItem>
                    <ListItemIcon>
                      <ArticleIcon/>
                    </ListItemIcon>
                    <ListItemText primary={this.state.status_message} secondary="Order status"/>
                  </ListItem>
                  <Divider/>
              </>
            :<Divider><Chip label='Order Details'/></Divider>
            }
            
            <ListItem>
              <ListItemIcon>
               {getFlags(this.state.currencyCode)}
              </ListItemIcon>
              <ListItemText primary={parseFloat(parseFloat(this.state.amount).toFixed(4))
                +" "+this.state.currencyCode} secondary="Amount"/>
            </ListItem>
            <Divider />
            <ListItem>
              <ListItemIcon>
                <PaymentsIcon/>
              </ListItemIcon>
              <ListItemText primary={this.state.payment_method} secondary={this.state.currency==1000 ? "Swap destination":"Accepted payment methods"}/>
            </ListItem>
            <Divider />

            {/* If there is live Price and Premium data, show it. Otherwise show the order maker settings */}
            <ListItem>
              <ListItemIcon>
                <PriceChangeIcon/>
              </ListItemIcon>
            {this.state.price_now? 
                <ListItemText primary={pn(this.state.price_now)+" "+this.state.currencyCode+"/BTC - Premium: "+this.state.premium_now+"%"} secondary="Price and Premium"/>
            :
              (this.state.is_explicit ? 
                <ListItemText primary={pn(this.state.satoshis)} secondary="Amount of Satoshis"/>
                :
                <ListItemText primary={parseFloat(parseFloat(this.state.premium).toFixed(2))+"%"} secondary="Premium over market price"/>
              )
            } 
            </ListItem>
            <Divider />

            <ListItem>
              <ListItemIcon>
                <NumbersIcon/>
              </ListItemIcon>
              <ListItemText primary={this.orderId} secondary="Order ID"/>
            </ListItem>
            <Divider />
            <ListItem>
              <ListItemIcon>
                <AccessTimeIcon/>
              </ListItemIcon>
              <ListItemText secondary="Expires in">
                <Countdown date={new Date(this.state.expires_at)} renderer={this.countdownRenderer} />
              </ListItemText>
            </ListItem>
            <this.LinearDeterminate />
            </List>
            
            {/* If the user has a penalty/limit */}
            {this.state.penalty ? 
            <>
              <Divider />
              <Grid item xs={12} align="center">
                <Alert severity="warning" sx={{maxWidth:360}}>
                   <Countdown date={new Date(this.state.penalty)} renderer={this.countdownPenaltyRenderer} />
                </Alert>  
              </Grid>
            </>
            : null} 
            
            {/* If the counterparty asked for collaborative cancel */}
            {this.state.pending_cancel ? 
            <>
              <Divider />
              <Grid item xs={12} align="center">
                <Alert severity="warning" sx={{maxWidth:360}}>
                  {this.state.is_maker ? this.state.taker_nick : this.state.maker_nick} is asking for a collaborative cancel
                </Alert>  
              </Grid>
            </>
            : null} 

            {/* If the user has asked for a collaborative cancel */}
            {this.state.asked_for_cancel ? 
            <>
              <Divider />
              <Grid item xs={12} align="center">
                <Alert severity="warning" sx={{maxWidth:360}}>
                  You asked for a collaborative cancellation
                </Alert>  
              </Grid>
            </>
            : null} 

          </Paper>
        </Grid>
        
        <Grid item xs={12} align="center">
          {/* Participants can see the "Cancel" Button, but cannot see the "Back" or "Take Order" buttons */}
          {this.state.is_participant ? 
            <this.CancelButton/>
          :
            <Grid container spacing={1}>
              <Grid item xs={12} align="center">
                <Countdown date={new Date(this.state.penalty)} renderer={this.countdownTakeOrderRenderer} />
              </Grid>
              <Grid item xs={12} align="center">
                <Button variant='contained' color='secondary' onClick={this.props.history.goBack}>Back</Button>
              </Grid>
            </Grid>
            }
        </Grid>
      </Grid>
    )
  }
  
  doubleOrderPageDesktop=()=>{
    return(
      <Grid container xs={12} align="center" spacing={2} >
        <Grid item xs={6} align="left" style={{ width:330}} >
            {this.orderBox()}
        </Grid>
        <Grid item xs={6} align="left">
          <TradeBox push={this.props.history.push} width={330} data={this.state} completeSetState={this.completeSetState} />
        </Grid>
      </Grid>
    )
  }
  
  a11yProps(index) {
    return {
      id: `simple-tab-${index}`,
      'aria-controls': `simple-tabpanel-${index}`,
    };
  }

  doubleOrderPagePhone=()=>{

    const [value, setValue] = React.useState(this.state.showContractBox);

    const handleChange = (event, newValue) => {
      this.setState({showContractBox:newValue})
      setValue(newValue);
    };

    return(
      <Box sx={{ width: '100%' }}>
        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs value={value} onChange={handleChange} variant="fullWidth" >
            <Tab label="Order" {...this.a11yProps(0)} />
            <Tab label="Contract" {...this.a11yProps(1)} />
          </Tabs>
        </Box>
        <Grid container spacing={2}>
          <Grid item >
            <div style={{ width:330, display: this.state.showContractBox == 0 ? '':'none'}}>
                {this.orderBox()}
            </div>
            <div style={{display: this.state.showContractBox == 1 ? '':'none'}}>
              <TradeBox push={this.props.history.push} width={330} data={this.state} completeSetState={this.completeSetState} />
            </div>
          </Grid>
        </Grid>
      </Box>
  );
  }

  orderDetailsPage (){
    return(
      this.state.bad_request ?
        <div align='center'>
          <Typography component="subtitle2" variant="subtitle2" color="secondary" >
            {this.state.bad_request}<br/>
          </Typography>
          <Button variant='contained' color='secondary' onClick={this.props.history.goBack}>Back</Button>
        </div>
        :
        (this.state.is_participant ? 
          <>
            {/* Desktop View */}
            <MediaQuery minWidth={920}>
              <this.doubleOrderPageDesktop/>
            </MediaQuery>

            {/* SmarPhone View */}
            <MediaQuery maxWidth={919}>
              <this.doubleOrderPagePhone/>
            </MediaQuery>
          </>
          :
          <Grid item xs={12} align="center" style={{ width:330}}>
            {this.orderBox()}
          </Grid>)
    )
  }

  render (){
    return ( 
      // Only so nothing shows while requesting the first batch of data
      this.state.loading ? <CircularProgress /> : this.orderDetailsPage()
    );
  }
}
