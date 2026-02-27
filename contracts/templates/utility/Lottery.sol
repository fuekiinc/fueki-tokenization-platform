// SPDX-License-Identifier: MIT
pragma solidity ^0.8.7;

interface IMidpoint {
    function callMidpoint(uint64 midpointId, bytes calldata _data)
        external
        returns (uint64 requestId);
}

contract Lottery {
    event RequestMade(int256 max, int256 min);
    event ResponseReceived(int256 random);

    address public startpointAddress;

    address constant whitelistedCallbackAddress =
        0xC0FFEE4a3A2D488B138d090b8112875B90b5e6D9;

    uint64 public midpointID;

    address public organizer;
    address[] public players;
    address public latestWinner;
    bool public isOpen;
    uint256 public minimum = 0;
    uint256 public ticketpricewei;
    uint256 public maxTickets;

    constructor(uint64 _midpointID, address _startpointAddress) {
        _owner = msg.sender;
        midpointID = _midpointID;
        startpointAddress = _startpointAddress;
    }

    function startLottery(uint256 _maxTickets, uint256 _weival)
        public
        onlyOwner
    {
        require(isOpen == false, "the lottery has not started yet");
        maxTickets = _maxTickets;
        ticketpricewei = _weival;
        isOpen = true;
    }

    function enter() public payable {
        require(msg.value >= ticketpricewei, "did not pay enough");
        require(isOpen, "the lottery has not started yet");
        uint256 ticketCount = msg.value / ticketpricewei;
        require(players.length + ticketCount <= maxTickets);
        for (uint256 i = 0; i < ticketCount; i++) {
            players.push(msg.sender);
        }
    }

    function pickWinner() public onlyOwner {
        require(isOpen == true, "the lottery has not started yet");
        bytes memory args = abi.encodePacked((players.length - 1), minimum);
        uint64 Request_ID = IMidpoint(startpointAddress).callMidpoint(
            midpointID,
            args
        );
    }

    function payWinner(uint256 random) public {
        require(
            tx.origin == whitelistedCallbackAddress,
            "Invalid callback address"
        );
        uint256 index = random;
        payable(players[index]).transfer(address(this).balance);
        latestWinner = players[index];
        isOpen = false;
    }

    address private _owner;

    function owner() public view virtual returns (address) {
        return _owner;
    }

    modifier onlyOwner() {
        require(
            owner() == msg.sender,
            "Ownership Assertion: Caller of the function is not the owner."
        );
        _;
    }

    function transferOwnership(address newOwner) public virtual onlyOwner {
        _owner = newOwner;
    }
}
